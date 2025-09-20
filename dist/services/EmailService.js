"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const EmailCampaign_1 = require("../models/EmailCampaign");
const Subscriber_1 = require("../models/Subscriber");
class EmailService {
    constructor(pool, sendgridApiKey) {
        this.pool = pool;
        this.emailCampaign = new EmailCampaign_1.EmailCampaign(pool);
        this.subscriber = new Subscriber_1.Subscriber(pool);
        // Initialize SendGrid
        this.sendgridApiKey = sendgridApiKey || process.env.SENDGRID_API_KEY || '';
        if (!this.sendgridApiKey) {
            throw new Error('SendGrid API key is required');
        }
        mail_1.default.setApiKey(this.sendgridApiKey);
    }
    // Campaign Management
    async createCampaign(campaignData) {
        // Validate campaign data
        if (!EmailCampaign_1.EmailCampaign.validateName(campaignData.name)) {
            throw new Error('Invalid campaign name: must be 1-200 characters');
        }
        if (!EmailCampaign_1.EmailCampaign.validateSubject(campaignData.subject)) {
            throw new Error('Invalid subject: must be 1-300 characters');
        }
        if (!EmailCampaign_1.EmailCampaign.validateContent(campaignData.content)) {
            throw new Error('Invalid content: must be 1-1,000,000 characters');
        }
        if (!EmailCampaign_1.EmailCampaign.validateType(campaignData.type)) {
            throw new Error('Invalid campaign type');
        }
        return this.emailCampaign.create(campaignData);
    }
    async updateCampaign(campaignId, updateData, creatorId) {
        // Verify campaign exists and user has permission
        const existingCampaign = await this.emailCampaign.findById(campaignId);
        if (!existingCampaign) {
            throw new Error('Email campaign not found');
        }
        if (creatorId && existingCampaign.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only edit your own campaigns');
        }
        if (!EmailCampaign_1.EmailCampaign.canEdit(existingCampaign.status)) {
            throw new Error('Cannot edit campaign that has been sent or is currently sending');
        }
        // Validate update data
        if (updateData.name && !EmailCampaign_1.EmailCampaign.validateName(updateData.name)) {
            throw new Error('Invalid campaign name: must be 1-200 characters');
        }
        if (updateData.subject && !EmailCampaign_1.EmailCampaign.validateSubject(updateData.subject)) {
            throw new Error('Invalid subject: must be 1-300 characters');
        }
        if (updateData.content && !EmailCampaign_1.EmailCampaign.validateContent(updateData.content)) {
            throw new Error('Invalid content: must be 1-1,000,000 characters');
        }
        const updatedCampaign = await this.emailCampaign.update(campaignId, updateData);
        if (!updatedCampaign) {
            throw new Error('Failed to update campaign');
        }
        return updatedCampaign;
    }
    async getCampaign(campaignId, creatorId) {
        const campaign = await this.emailCampaign.findById(campaignId);
        if (!campaign) {
            return null;
        }
        if (creatorId && campaign.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only view your own campaigns');
        }
        return campaign;
    }
    async getCampaigns(creatorId) {
        return this.emailCampaign.findByCreatorId(creatorId);
    }
    async duplicateCampaign(campaignId, newName, creatorId) {
        const existingCampaign = await this.emailCampaign.findById(campaignId);
        if (!existingCampaign) {
            throw new Error('Campaign not found');
        }
        if (creatorId && existingCampaign.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only duplicate your own campaigns');
        }
        return this.emailCampaign.duplicate(campaignId, newName);
    }
    async deleteCampaign(campaignId, creatorId) {
        const existingCampaign = await this.emailCampaign.findById(campaignId);
        if (!existingCampaign) {
            throw new Error('Campaign not found');
        }
        if (creatorId && existingCampaign.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only delete your own campaigns');
        }
        if (!EmailCampaign_1.EmailCampaign.canDelete(existingCampaign.status)) {
            throw new Error('Can only delete draft campaigns');
        }
        const deleted = await this.emailCampaign.delete(campaignId);
        if (!deleted) {
            throw new Error('Failed to delete campaign');
        }
    }
    // Subscriber Management
    async addSubscriber(subscriberData) {
        // Validate subscriber data
        if (!Subscriber_1.Subscriber.validateEmail(subscriberData.email)) {
            throw new Error('Invalid email address');
        }
        if (!Subscriber_1.Subscriber.validateSource(subscriberData.source)) {
            throw new Error('Invalid subscriber source');
        }
        if (subscriberData.tags && !Subscriber_1.Subscriber.validateTags(subscriberData.tags)) {
            throw new Error('Invalid tags: maximum 20 tags, each 1-50 characters');
        }
        // Check if subscriber already exists
        const existingSubscriber = await this.subscriber.findByEmail(subscriberData.email);
        if (existingSubscriber) {
            if (existingSubscriber.status === 'unsubscribed') {
                // Resubscribe existing user
                const resubscribed = await this.subscriber.resubscribe(existingSubscriber.id);
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
    async unsubscribeByEmail(email) {
        const subscriber = await this.subscriber.findByEmail(email);
        if (!subscriber) {
            throw new Error('Subscriber not found');
        }
        if (subscriber.status === 'unsubscribed') {
            return subscriber;
        }
        return this.subscriber.unsubscribeByEmail(email);
    }
    async getSubscribers(filters = {}) {
        return this.subscriber.findMany(filters);
    }
    async getSubscriberStats() {
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
    async sendSingleEmail(request) {
        try {
            const emailData = {
                to: request.to,
                from: process.env.FROM_EMAIL || 'noreply@example.com',
                subject: request.subject,
                html: request.html_content,
                text: request.text_content,
                customArgs: request.custom_args
            };
            if (request.template_id) {
                emailData.templateId = request.template_id;
                emailData.dynamicTemplateData = request.dynamic_template_data || {};
            }
            if (request.send_at) {
                emailData.sendAt = request.send_at;
            }
            const result = await mail_1.default.send(emailData);
            return {
                message_id: result[0].headers['x-message-id'] || '',
                status: 'sent'
            };
        }
        catch (error) {
            console.error('SendGrid error:', error);
            return {
                message_id: '',
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async sendBulkEmail(request) {
        const campaign = await this.emailCampaign.findById(request.campaign_id);
        if (!campaign) {
            throw new Error('Campaign not found');
        }
        if (!EmailCampaign_1.EmailCampaign.canSend(campaign.status)) {
            throw new Error('Campaign cannot be sent in current status');
        }
        // Get targeted subscribers
        const filters = {
            ...request.segment_filters,
            status: (request.exclude_unsubscribed !== false ? 'active' : undefined)
        };
        const { subscribers } = await this.subscriber.findMany(filters);
        if (subscribers.length === 0) {
            throw new Error('No subscribers found for this campaign');
        }
        // Update campaign status
        await this.emailCampaign.startSending(request.campaign_id, subscribers.length);
        const results = { sent: 0, failed: 0, errors: [] };
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
                            subscriber_id: subscriber.id
                        }
                    });
                    if (result.status === 'sent') {
                        results.sent++;
                        // Record delivery in campaign stats
                        await this.recordEmailDelivery(request.campaign_id, subscriber.id, result.message_id);
                    }
                    else {
                        results.failed++;
                        if (result.error)
                            results.errors.push(result.error);
                    }
                }
                catch (error) {
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
    async scheduleCampaign(campaignId, scheduledAt, creatorId) {
        const campaign = await this.emailCampaign.findById(campaignId);
        if (!campaign) {
            throw new Error('Campaign not found');
        }
        if (creatorId && campaign.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only schedule your own campaigns');
        }
        if (!EmailCampaign_1.EmailCampaign.canSend(campaign.status)) {
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
    async getCampaignStats(creatorId) {
        return this.emailCampaign.getStats(creatorId);
    }
    async getCampaignAnalytics(campaignId, creatorId) {
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
    async sendWelcomeEmail(subscriber) {
        const welcomeTemplate = await this.getWelcomeTemplate();
        if (!welcomeTemplate)
            return;
        const personalizedContent = this.personalizeContent(welcomeTemplate.html_content, subscriber);
        const personalizedSubject = this.personalizeContent(welcomeTemplate.subject, subscriber);
        await this.sendSingleEmail({
            to: subscriber.email,
            subject: personalizedSubject,
            html_content: personalizedContent,
            custom_args: {
                type: 'welcome',
                subscriber_id: subscriber.id
            }
        });
    }
    async sendArticleNotification(articleId, articleTitle, articleUrl) {
        // Send to active subscribers
        const { subscribers } = await this.subscriber.findMany({ status: 'active' });
        const template = await this.getArticleNotificationTemplate();
        if (!template || subscribers.length === 0)
            return;
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
                        subscriber_id: subscriber.id
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
    async handleSendGridWebhook(events) {
        for (const event of events) {
            try {
                await this.processSendGridEvent(event);
            }
            catch (error) {
                console.error('Error processing SendGrid event:', error);
            }
        }
    }
    // Private Helper Methods
    personalizeContent(content, subscriber, extraVars = {}) {
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
    async recordEmailDelivery(campaignId, subscriberId, messageId) {
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
    async getWelcomeTemplate() {
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
    async getArticleNotificationTemplate() {
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
    async processSendGridEvent(event) {
        const { campaign_id, subscriber_id } = event.custom_args || {};
        if (!campaign_id || !subscriber_id)
            return;
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
    async recordEmailOpen(campaignId, subscriberId, openedAt) {
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
    async recordEmailClick(campaignId, subscriberId, clickedAt) {
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
    async recordEmailUnsubscribe(campaignId, subscriberId, unsubscribedAt) {
        const query = `
      UPDATE email_campaign_stats
      SET unsubscribed_at = $1
      WHERE campaign_id = $2 AND subscriber_id = $3
    `;
        await this.pool.query(query, [unsubscribedAt, campaignId, subscriberId]);
    }
    async handleEmailBounce(subscriberId, reason) {
        // Mark subscriber as bounced if hard bounce
        if (reason && (reason.includes('bounce') || reason.includes('invalid'))) {
            await this.subscriber.update(subscriberId, { status: 'bounced' });
        }
    }
    // Utility methods
    static validateEmailContent(content) {
        if (content.length === 0) {
            return { valid: false, message: 'Email content cannot be empty' };
        }
        if (content.length > 1000000) {
            return { valid: false, message: 'Email content too large (max 1MB)' };
        }
        return { valid: true };
    }
    static extractTextFromHtml(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
}
exports.EmailService = EmailService;
//# sourceMappingURL=EmailService.js.map