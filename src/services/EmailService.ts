import { Pool } from 'pg';
import sgMail from '@sendgrid/mail';
import { EmailCampaign, EmailCampaignData, CreateEmailCampaignData, UpdateEmailCampaignData, EmailCampaignStats } from '../models/EmailCampaign';
import { Subscriber, SubscriberData, CreateSubscriberData, SubscriberFilters } from '../models/Subscriber';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  variables?: Record<string, string>;
}

export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  html_content: string;
  text_content?: string;
  template_id?: string;
  dynamic_template_data?: Record<string, any>;
  custom_args?: Record<string, string>;
  send_at?: number; // Unix timestamp for scheduled sending
}

export interface BulkEmailRequest {
  campaign_id: string;
  segment_filters?: SubscriberFilters;
  exclude_unsubscribed?: boolean;
  send_at?: Date;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: 'subscription' | 'article_published' | 'engagement_score' | 'date_based';
  conditions: Record<string, any>;
  template_id: string;
  delay_hours?: number;
  is_active: boolean;
}

export interface EmailStats {
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  spam_reports: number;
}

export interface SendResult {
  message_id: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
}

export class EmailService {
  private emailCampaign: EmailCampaign;
  private subscriber: Subscriber;
  private pool: Pool;
  private sendgridApiKey: string;

  constructor(pool: Pool, sendgridApiKey?: string) {
    this.pool = pool;
    this.emailCampaign = new EmailCampaign(pool);
    this.subscriber = new Subscriber(pool);

    // Initialize SendGrid
    this.sendgridApiKey = sendgridApiKey || process.env.SENDGRID_API_KEY || '';
    if (!this.sendgridApiKey) {
      throw new Error('SendGrid API key is required');
    }
    sgMail.setApiKey(this.sendgridApiKey);
  }

  // Campaign Management
  async createCampaign(campaignData: CreateEmailCampaignData): Promise<EmailCampaignData> {
    // Validate campaign data
    if (!EmailCampaign.validateName(campaignData.name)) {
      throw new Error('Invalid campaign name: must be 1-200 characters');
    }

    if (!EmailCampaign.validateSubject(campaignData.subject)) {
      throw new Error('Invalid subject: must be 1-300 characters');
    }

    if (!EmailCampaign.validateContent(campaignData.content)) {
      throw new Error('Invalid content: must be 1-1,000,000 characters');
    }

    if (!EmailCampaign.validateType(campaignData.type)) {
      throw new Error('Invalid campaign type');
    }

    return this.emailCampaign.create(campaignData);
  }

  async updateCampaign(campaignId: string, updateData: UpdateEmailCampaignData, creatorId?: string): Promise<EmailCampaignData> {
    // Verify campaign exists and user has permission
    const existingCampaign = await this.emailCampaign.findById(campaignId);
    if (!existingCampaign) {
      throw new Error('Email campaign not found');
    }

    if (creatorId && existingCampaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only edit your own campaigns');
    }

    if (!EmailCampaign.canEdit(existingCampaign.status)) {
      throw new Error('Cannot edit campaign that has been sent or is currently sending');
    }

    // Validate update data
    if (updateData.name && !EmailCampaign.validateName(updateData.name)) {
      throw new Error('Invalid campaign name: must be 1-200 characters');
    }

    if (updateData.subject && !EmailCampaign.validateSubject(updateData.subject)) {
      throw new Error('Invalid subject: must be 1-300 characters');
    }

    if (updateData.content && !EmailCampaign.validateContent(updateData.content)) {
      throw new Error('Invalid content: must be 1-1,000,000 characters');
    }

    const updatedCampaign = await this.emailCampaign.update(campaignId, updateData);
    if (!updatedCampaign) {
      throw new Error('Failed to update campaign');
    }

    return updatedCampaign;
  }

  async getCampaign(campaignId: string, creatorId?: string): Promise<EmailCampaignData | null> {
    const campaign = await this.emailCampaign.findById(campaignId);
    if (!campaign) {
      return null;
    }

    if (creatorId && campaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only view your own campaigns');
    }

    return campaign;
  }

  async getCampaigns(creatorId: string): Promise<EmailCampaignData[]> {
    return this.emailCampaign.findByCreatorId(creatorId);
  }

  async duplicateCampaign(campaignId: string, newName: string, creatorId?: string): Promise<EmailCampaignData | null> {
    const existingCampaign = await this.emailCampaign.findById(campaignId);
    if (!existingCampaign) {
      throw new Error('Campaign not found');
    }

    if (creatorId && existingCampaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only duplicate your own campaigns');
    }

    return this.emailCampaign.duplicate(campaignId, newName);
  }

  async deleteCampaign(campaignId: string, creatorId?: string): Promise<void> {
    const existingCampaign = await this.emailCampaign.findById(campaignId);
    if (!existingCampaign) {
      throw new Error('Campaign not found');
    }

    if (creatorId && existingCampaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only delete your own campaigns');
    }

    if (!EmailCampaign.canDelete(existingCampaign.status)) {
      throw new Error('Can only delete draft campaigns');
    }

    const deleted = await this.emailCampaign.delete(campaignId);
    if (!deleted) {
      throw new Error('Failed to delete campaign');
    }
  }

  // Subscriber Management
  async addSubscriber(subscriberData: CreateSubscriberData): Promise<SubscriberData> {
    // Validate subscriber data
    if (!Subscriber.validateEmail(subscriberData.email)) {
      throw new Error('Invalid email address');
    }

    if (!Subscriber.validateSource(subscriberData.source)) {
      throw new Error('Invalid subscriber source');
    }

    if (subscriberData.tags && !Subscriber.validateTags(subscriberData.tags)) {
      throw new Error('Invalid tags: maximum 20 tags, each 1-50 characters');
    }

    // Check if subscriber already exists
    const existingSubscriber = await this.subscriber.findByEmail(subscriberData.email);
    if (existingSubscriber) {
      if (existingSubscriber.status === 'unsubscribed') {
        // Resubscribe existing user
        const resubscribed = await this.subscriber.resubscribe(existingSubscriber.id!);
        return resubscribed || existingSubscriber;
      }
      throw new Error('Email already subscribed');
    }

    // Create new subscriber
    const newSubscriber = await this.subscriber.create(subscriberData);

    // Send welcome email if enabled
    await this.sendWelcomeEmail(newSubscriber);

    return newSubscriber;
  }

  async unsubscribeByEmail(email: string): Promise<SubscriberData | null> {
    const subscriber = await this.subscriber.findByEmail(email);
    if (!subscriber) {
      throw new Error('Subscriber not found');
    }

    if (subscriber.status === 'unsubscribed') {
      return subscriber;
    }

    return this.subscriber.unsubscribeByEmail(email);
  }

  async getSubscribers(filters: SubscriberFilters = {}): Promise<{ subscribers: SubscriberData[]; total: number }> {
    return this.subscriber.findMany(filters);
  }

  async getSubscriberStats(): Promise<{ active: number; total: number; bounceRate: number }> {
    const { subscribers: allSubscribers } = await this.subscriber.findMany({});
    const activeCount = await this.subscriber.getActiveCount();
    const bounceRate = await this.subscriber.getBounceRate();

    return {
      active: activeCount,
      total: allSubscribers.length,
      bounceRate
    };
  }

  // Email Sending
  async sendSingleEmail(request: SendEmailRequest): Promise<SendResult> {
    try {
      const emailData: sgMail.MailDataRequired = {
        to: request.to,
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        subject: request.subject,
        html: request.html_content,
        text: request.text_content,
        customArgs: request.custom_args
      };

      if (request.template_id) {
        (emailData as any).templateId = request.template_id;
        (emailData as any).dynamicTemplateData = request.dynamic_template_data || {};
      }

      if (request.send_at) {
        (emailData as any).sendAt = request.send_at;
      }

      const result = await sgMail.send(emailData);

      return {
        message_id: result[0].headers['x-message-id'] || '',
        status: 'sent'
      };
    } catch (error) {
      console.error('SendGrid error:', error);
      return {
        message_id: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async sendBulkEmail(request: BulkEmailRequest): Promise<{ sent: number; failed: number; errors: string[] }> {
    const campaign = await this.emailCampaign.findById(request.campaign_id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!EmailCampaign.canSend(campaign.status)) {
      throw new Error('Campaign cannot be sent in current status');
    }

    // Get targeted subscribers
    const filters = {
      ...request.segment_filters,
      status: (request.exclude_unsubscribed !== false ? 'active' : undefined) as 'active' | 'unsubscribed' | 'bounced' | undefined
    };

    const { subscribers } = await this.subscriber.findMany(filters);

    if (subscribers.length === 0) {
      throw new Error('No subscribers found for this campaign');
    }

    // Update campaign status
    await this.emailCampaign.startSending(request.campaign_id, subscribers.length);

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    // Send emails in batches to avoid rate limits
    const batchSize = 100;
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      const batchPromises = batch.map(async (subscriber) => {
        try {
          const personalizedContent = this.personalizeContent(campaign.content, subscriber);
          const personalizedSubject = this.personalizeContent(campaign.subject, subscriber);

          const result = await this.sendSingleEmail({
            to: subscriber.email,
            subject: personalizedSubject,
            html_content: personalizedContent,
            custom_args: {
              campaign_id: request.campaign_id,
              subscriber_id: subscriber.id!
            }
          });

          if (result.status === 'sent') {
            results.sent++;
            // Record delivery in campaign stats
            await this.recordEmailDelivery(request.campaign_id, subscriber.id!, result.message_id);
          } else {
            results.failed++;
            if (result.error) results.errors.push(result.error);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(error instanceof Error ? error.message : 'Unknown error');
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches to respect rate limits
      if (i + batchSize < subscribers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Mark campaign as sent
    await this.emailCampaign.markSent(request.campaign_id);

    return results;
  }

  async scheduleCampaign(campaignId: string, scheduledAt: Date, creatorId?: string): Promise<EmailCampaignData> {
    const campaign = await this.emailCampaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (creatorId && campaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only schedule your own campaigns');
    }

    if (!EmailCampaign.canSend(campaign.status)) {
      throw new Error('Campaign cannot be scheduled in current status');
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduledCampaign = await this.emailCampaign.schedule(campaignId, scheduledAt);
    if (!scheduledCampaign) {
      throw new Error('Failed to schedule campaign');
    }

    return scheduledCampaign;
  }

  // Analytics and Reporting
  async getCampaignStats(creatorId: string): Promise<EmailCampaignStats> {
    return this.emailCampaign.getStats(creatorId);
  }

  async getCampaignAnalytics(campaignId: string, creatorId?: string): Promise<EmailStats> {
    const campaign = await this.emailCampaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (creatorId && campaign.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only view analytics for your own campaigns');
    }

    const query = `
      SELECT
        COUNT(*) as delivered,
        COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opens,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicks,
        COUNT(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 END) as unsubscribes,
        0 as bounces,
        0 as spam_reports
      FROM email_campaign_stats
      WHERE campaign_id = $1 AND delivered_at IS NOT NULL
    `;

    const result = await this.pool.query(query, [campaignId]);
    const stats = result.rows[0];

    return {
      delivered: parseInt(stats.delivered) || 0,
      opens: parseInt(stats.opens) || 0,
      clicks: parseInt(stats.clicks) || 0,
      bounces: parseInt(stats.bounces) || 0,
      unsubscribes: parseInt(stats.unsubscribes) || 0,
      spam_reports: parseInt(stats.spam_reports) || 0
    };
  }

  // Automation and Triggers
  async sendWelcomeEmail(subscriber: SubscriberData): Promise<void> {
    const welcomeTemplate = await this.getWelcomeTemplate();
    if (!welcomeTemplate) return;

    const personalizedContent = this.personalizeContent(welcomeTemplate.html_content, subscriber);
    const personalizedSubject = this.personalizeContent(welcomeTemplate.subject, subscriber);

    await this.sendSingleEmail({
      to: subscriber.email,
      subject: personalizedSubject,
      html_content: personalizedContent,
      custom_args: {
        type: 'welcome',
        subscriber_id: subscriber.id!
      }
    });
  }

  async sendArticleNotification(articleId: string, articleTitle: string, articleUrl: string): Promise<void> {
    // Send to active subscribers
    const { subscribers } = await this.subscriber.findMany({ status: 'active' });

    const template = await this.getArticleNotificationTemplate();
    if (!template || subscribers.length === 0) return;

    const batchSize = 50;
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      const batchPromises = batch.map(async (subscriber) => {
        const personalizedContent = this.personalizeContent(template.html_content, subscriber, {
          article_title: articleTitle,
          article_url: articleUrl
        });

        const personalizedSubject = this.personalizeContent(template.subject, subscriber, {
          article_title: articleTitle
        });

        return this.sendSingleEmail({
          to: subscriber.email,
          subject: personalizedSubject,
          html_content: personalizedContent,
          custom_args: {
            type: 'article_notification',
            article_id: articleId,
            subscriber_id: subscriber.id!
          }
        });
      });

      await Promise.all(batchPromises);

      // Delay between batches
      if (i + batchSize < subscribers.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Webhook Handling for SendGrid Events
  async handleSendGridWebhook(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        await this.processSendGridEvent(event);
      } catch (error) {
        console.error('Error processing SendGrid event:', error);
      }
    }
  }

  // Private Helper Methods
  private personalizeContent(content: string, subscriber: SubscriberData, extraVars: Record<string, string> = {}): string {
    const variables = {
      first_name: subscriber.name?.split(' ')[0] || 'there',
      full_name: subscriber.name || subscriber.email,
      email: subscriber.email,
      ...extraVars
    };

    let personalizedContent = content;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      personalizedContent = personalizedContent.replace(regex, value);
    });

    return personalizedContent;
  }

  private async recordEmailDelivery(campaignId: string, subscriberId: string, messageId: string): Promise<void> {
    const query = `
      INSERT INTO email_campaign_stats (id, campaign_id, subscriber_id, delivered_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (campaign_id, subscriber_id) DO UPDATE SET
        delivered_at = EXCLUDED.delivered_at
    `;

    await this.pool.query(query, [
      require('uuid').v4(),
      campaignId,
      subscriberId,
      new Date()
    ]);
  }

  private async getWelcomeTemplate(): Promise<EmailTemplate | null> {
    // In a real implementation, this would fetch from a templates table
    return {
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Welcome to our newsletter, {{first_name}}!',
      html_content: `
        <h1>Welcome {{first_name}}!</h1>
        <p>Thank you for subscribing to our newsletter. We're excited to have you!</p>
        <p>You'll receive our best content directly in your inbox.</p>
      `
    };
  }

  private async getArticleNotificationTemplate(): Promise<EmailTemplate | null> {
    return {
      id: 'article_notification',
      name: 'New Article Notification',
      subject: 'New article: {{article_title}}',
      html_content: `
        <h1>New Article Published!</h1>
        <h2>{{article_title}}</h2>
        <p>We've just published a new article that we think you'll enjoy.</p>
        <a href="{{article_url}}" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Read Article</a>
      `
    };
  }

  private async processSendGridEvent(event: any): Promise<void> {
    const { campaign_id, subscriber_id } = event.custom_args || {};
    if (!campaign_id || !subscriber_id) return;

    switch (event.event) {
      case 'open':
        await this.recordEmailOpen(campaign_id, subscriber_id, new Date(event.timestamp * 1000));
        break;
      case 'click':
        await this.recordEmailClick(campaign_id, subscriber_id, new Date(event.timestamp * 1000));
        break;
      case 'unsubscribe':
        await this.recordEmailUnsubscribe(campaign_id, subscriber_id, new Date(event.timestamp * 1000));
        await this.subscriber.unsubscribe(subscriber_id);
        break;
      case 'bounce':
        await this.handleEmailBounce(subscriber_id, event.reason);
        break;
    }
  }

  private async recordEmailOpen(campaignId: string, subscriberId: string, openedAt: Date): Promise<void> {
    const query = `
      UPDATE email_campaign_stats
      SET opened_at = $1
      WHERE campaign_id = $2 AND subscriber_id = $3 AND opened_at IS NULL
    `;

    await this.pool.query(query, [openedAt, campaignId, subscriberId]);

    // Update subscriber engagement
    await this.subscriber.update(subscriberId, { last_opened: openedAt });
    await this.subscriber.updateEngagementScore(subscriberId);

    // Update campaign stats
    await this.emailCampaign.updateStats(campaignId);
  }

  private async recordEmailClick(campaignId: string, subscriberId: string, clickedAt: Date): Promise<void> {
    const query = `
      UPDATE email_campaign_stats
      SET clicked_at = $1
      WHERE campaign_id = $2 AND subscriber_id = $3 AND clicked_at IS NULL
    `;

    await this.pool.query(query, [clickedAt, campaignId, subscriberId]);

    // Update subscriber engagement
    await this.subscriber.updateEngagementScore(subscriberId);

    // Update campaign stats
    await this.emailCampaign.updateStats(campaignId);
  }

  private async recordEmailUnsubscribe(campaignId: string, subscriberId: string, unsubscribedAt: Date): Promise<void> {
    const query = `
      UPDATE email_campaign_stats
      SET unsubscribed_at = $1
      WHERE campaign_id = $2 AND subscriber_id = $3
    `;

    await this.pool.query(query, [unsubscribedAt, campaignId, subscriberId]);
  }

  private async handleEmailBounce(subscriberId: string, reason: string): Promise<void> {
    // Mark subscriber as bounced if hard bounce
    if (reason && (reason.includes('bounce') || reason.includes('invalid'))) {
      await this.subscriber.update(subscriberId, { status: 'bounced' });
    }
  }

  // Utility methods
  static validateEmailContent(content: string): { valid: boolean; message?: string } {
    if (content.length === 0) {
      return { valid: false, message: 'Email content cannot be empty' };
    }

    if (content.length > 1000000) {
      return { valid: false, message: 'Email content too large (max 1MB)' };
    }

    return { valid: true };
  }

  static extractTextFromHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}