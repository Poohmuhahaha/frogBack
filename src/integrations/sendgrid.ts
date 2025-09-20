import SendGrid from '@sendgrid/mail';
import { MailService } from '@sendgrid/mail';
import database from '../database/connection';
import { CustomError } from '../middleware/errorHandler';

interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables?: string[];
}

interface SendEmailData {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  categories?: string[];
  customArgs?: Record<string, string>;
  sendAt?: Date;
}

interface ContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, any>;
  listIds?: string[];
}

interface EmailCampaignData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  listIds: string[];
  sendAt?: Date;
  categories?: string[];
  customArgs?: Record<string, string>;
}

export class SendGridIntegration {
  private sendgrid: MailService;
  private config: SendGridConfig;

  constructor() {
    this.config = {
      apiKey: process.env.SENDGRID_API_KEY!,
      fromEmail: process.env.SENDGRID_FROM_EMAIL!,
      fromName: process.env.SENDGRID_FROM_NAME || 'Frogtales',
      replyToEmail: process.env.SENDGRID_REPLY_TO_EMAIL
    };

    if (!this.config.apiKey) {
      throw new Error('SENDGRID_API_KEY environment variable is required');
    }

    if (!this.config.fromEmail) {
      throw new Error('SENDGRID_FROM_EMAIL environment variable is required');
    }

    this.sendgrid = SendGrid;
    this.sendgrid.setApiKey(this.config.apiKey);
  }

  async sendEmail(data: SendEmailData): Promise<void> {
    try {
      const emailData = {
        to: data.to,
        from: {
          email: data.from || this.config.fromEmail,
          name: this.config.fromName
        },
        subject: data.subject,
        html: data.html,
        text: data.text,
        templateId: data.templateId,
        dynamicTemplateData: data.templateData,
        categories: data.categories,
        customArgs: data.customArgs,
        sendAt: data.sendAt ? Math.floor(data.sendAt.getTime() / 1000) : undefined,
        replyTo: this.config.replyToEmail ? {
          email: this.config.replyToEmail,
          name: this.config.fromName
        } : undefined
      };

      const response = await this.sendgrid.send(emailData);
      console.log('Email sent successfully:', response[0].statusCode);

      await this.logEmailSend(data, response[0].headers['x-message-id']);
    } catch (error) {
      console.error('SendGrid send email error:', error);
      throw new CustomError('Failed to send email', 400, 'SENDGRID_SEND_FAILED');
    }
  }

  async sendBulkEmail(emails: SendEmailData[]): Promise<void> {
    try {
      const emailsData = emails.map(data => ({
        to: data.to,
        from: {
          email: data.from || this.config.fromEmail,
          name: this.config.fromName
        },
        subject: data.subject,
        html: data.html,
        text: data.text,
        templateId: data.templateId,
        dynamicTemplateData: data.templateData,
        categories: data.categories,
        customArgs: data.customArgs,
        sendAt: data.sendAt ? Math.floor(data.sendAt.getTime() / 1000) : undefined
      }));

      const response = await this.sendgrid.send(emailsData);
      console.log('Bulk emails sent successfully:', response[0].statusCode);

      for (let i = 0; i < emails.length; i++) {
        await this.logEmailSend(emails[i], response[0].headers['x-message-id']);
      }
    } catch (error) {
      console.error('SendGrid send bulk email error:', error);
      throw new CustomError('Failed to send bulk emails', 400, 'SENDGRID_BULK_SEND_FAILED');
    }
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<void> {
    const emailData: SendEmailData = {
      to: email,
      subject: 'Welcome to Frogtales!',
      html: this.generateWelcomeEmailHtml(name),
      text: this.generateWelcomeEmailText(name),
      categories: ['welcome', 'onboarding'],
      customArgs: {
        type: 'welcome',
        automated: 'true'
      }
    };

    await this.sendEmail(emailData);
  }

  async sendPasswordResetEmail(email: string, resetToken: string, name?: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const emailData: SendEmailData = {
      to: email,
      subject: 'Reset Your Password - Frogtales',
      html: this.generatePasswordResetEmailHtml(resetUrl, name),
      text: this.generatePasswordResetEmailText(resetUrl, name),
      categories: ['password-reset', 'security'],
      customArgs: {
        type: 'password_reset',
        automated: 'true'
      }
    };

    await this.sendEmail(emailData);
  }

  async sendEmailVerificationEmail(email: string, verificationToken: string, name?: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verificationToken}`;

    const emailData: SendEmailData = {
      to: email,
      subject: 'Verify Your Email - Frogtales',
      html: this.generateEmailVerificationHtml(verificationUrl, name),
      text: this.generateEmailVerificationText(verificationUrl, name),
      categories: ['email-verification', 'onboarding'],
      customArgs: {
        type: 'email_verification',
        automated: 'true'
      }
    };

    await this.sendEmail(emailData);
  }

  async sendNewsletterEmail(data: {
    subject: string;
    content: string;
    recipients: string[];
    campaignId?: string;
  }): Promise<void> {
    const emailData: SendEmailData = {
      to: data.recipients,
      subject: data.subject,
      html: this.generateNewsletterHtml(data.content),
      text: this.extractTextFromHtml(data.content),
      categories: ['newsletter', 'marketing'],
      customArgs: {
        type: 'newsletter',
        campaign_id: data.campaignId || '',
        automated: 'false'
      }
    };

    await this.sendEmail(emailData);
  }

  async addContact(data: ContactData): Promise<void> {
    try {
      const request = {
        method: 'PUT' as const,
        url: '/v3/marketing/contacts',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contacts: [{
            email: data.email,
            first_name: data.firstName,
            last_name: data.lastName,
            custom_fields: data.customFields
          }],
          list_ids: data.listIds || []
        })
      };

      const response = await fetch('https://api.sendgrid.com' + request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });

      if (!response.ok) {
        throw new Error(`SendGrid API error: ${response.status}`);
      }

      console.log('Contact added successfully');
      await this.logContactAction('add', data.email);
    } catch (error) {
      console.error('SendGrid add contact error:', error);
      throw new CustomError('Failed to add contact', 400, 'SENDGRID_ADD_CONTACT_FAILED');
    }
  }

  async removeContact(email: string): Promise<void> {
    try {
      const searchResponse = await fetch(`https://api.sendgrid.com/v3/marketing/contacts/search/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emails: [email] })
      });

      if (!searchResponse.ok) {
        throw new Error(`SendGrid search API error: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const contact = searchData.result?.[email];

      if (contact?.contact?.id) {
        const deleteResponse = await fetch(`https://api.sendgrid.com/v3/marketing/contacts?ids=${contact.contact.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        });

        if (!deleteResponse.ok) {
          throw new Error(`SendGrid delete API error: ${deleteResponse.status}`);
        }

        console.log('Contact removed successfully');
        await this.logContactAction('remove', email);
      }
    } catch (error) {
      console.error('SendGrid remove contact error:', error);
      throw new CustomError('Failed to remove contact', 400, 'SENDGRID_REMOVE_CONTACT_FAILED');
    }
  }

  async createList(name: string): Promise<string> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/marketing/lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        throw new Error(`SendGrid create list API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('List created successfully:', data.id);
      return data.id;
    } catch (error) {
      console.error('SendGrid create list error:', error);
      throw new CustomError('Failed to create list', 400, 'SENDGRID_CREATE_LIST_FAILED');
    }
  }

  async getEmailStats(categories?: string[]): Promise<any> {
    try {
      const params = new URLSearchParams({
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      });

      if (categories && categories.length > 0) {
        categories.forEach(category => params.append('categories', category));
      }

      const response = await fetch(`https://api.sendgrid.com/v3/stats?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`SendGrid stats API error: ${response.status}`);
      }

      const stats = await response.json();
      return this.processEmailStats(stats);
    } catch (error) {
      console.error('SendGrid get stats error:', error);
      throw new CustomError('Failed to get email stats', 400, 'SENDGRID_GET_STATS_FAILED');
    }
  }

  private async logEmailSend(emailData: SendEmailData, messageId?: string): Promise<void> {
    const insertQuery = `
      INSERT INTO email_sends (
        id, recipient_email, subject, message_id, status, categories,
        custom_args, sent_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `;

    const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];

    for (const recipient of recipients) {
      await database.query(insertQuery, [
        crypto.randomUUID(),
        recipient,
        emailData.subject,
        messageId,
        'sent',
        JSON.stringify(emailData.categories || []),
        JSON.stringify(emailData.customArgs || {}),
      ]);
    }
  }

  private async logContactAction(action: string, email: string): Promise<void> {
    const insertQuery = `
      INSERT INTO sendgrid_contact_logs (
        id, email, action, timestamp, created_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
    `;

    await database.query(insertQuery, [
      crypto.randomUUID(),
      email,
      action
    ]);
  }

  private generateWelcomeEmailHtml(name?: string): string {
    const displayName = name || 'there';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4CAF50;">Welcome to Frogtales!</h1>
        <p>Hi ${displayName},</p>
        <p>Thank you for joining our community of content creators and learners!</p>
        <p>You can now:</p>
        <ul>
          <li>Create and publish academic content</li>
          <li>Build your subscriber base</li>
          <li>Monetize your expertise</li>
          <li>Track your performance with analytics</li>
        </ul>
        <p>Get started by visiting your <a href="${process.env.FRONTEND_URL}/dashboard" style="color: #4CAF50;">dashboard</a>.</p>
        <p>Best regards,<br>The Frogtales Team</p>
      </div>
    `;
  }

  private generateWelcomeEmailText(name?: string): string {
    const displayName = name || 'there';
    return `
Welcome to Frogtales!

Hi ${displayName},

Thank you for joining our community of content creators and learners!

You can now:
- Create and publish academic content
- Build your subscriber base
- Monetize your expertise
- Track your performance with analytics

Get started by visiting your dashboard: ${process.env.FRONTEND_URL}/dashboard

Best regards,
The Frogtales Team
    `.trim();
  }

  private generatePasswordResetEmailHtml(resetUrl: string, name?: string): string {
    const displayName = name || 'there';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #FF6B6B;">Password Reset Request</h1>
        <p>Hi ${displayName},</p>
        <p>We received a request to reset your password for your Frogtales account.</p>
        <p>Click the button below to reset your password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #FF6B6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
        </p>
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>Best regards,<br>The Frogtales Team</p>
      </div>
    `;
  }

  private generatePasswordResetEmailText(resetUrl: string, name?: string): string {
    const displayName = name || 'there';
    return `
Password Reset Request

Hi ${displayName},

We received a request to reset your password for your Frogtales account.

Reset your password by clicking this link: ${resetUrl}

If you didn't request this password reset, you can safely ignore this email.

This link will expire in 1 hour for security reasons.

Best regards,
The Frogtales Team
    `.trim();
  }

  private generateEmailVerificationHtml(verificationUrl: string, name?: string): string {
    const displayName = name || 'there';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4CAF50;">Verify Your Email Address</h1>
        <p>Hi ${displayName},</p>
        <p>Thank you for signing up for Frogtales! Please verify your email address to complete your registration.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
        </p>
        <p>If you didn't create an account with Frogtales, you can safely ignore this email.</p>
        <p>Best regards,<br>The Frogtales Team</p>
      </div>
    `;
  }

  private generateEmailVerificationText(verificationUrl: string, name?: string): string {
    const displayName = name || 'there';
    return `
Verify Your Email Address

Hi ${displayName},

Thank you for signing up for Frogtales! Please verify your email address to complete your registration.

Verify your email by clicking this link: ${verificationUrl}

If you didn't create an account with Frogtales, you can safely ignore this email.

Best regards,
The Frogtales Team
    `.trim();
  }

  private generateNewsletterHtml(content: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 20px; background-color: #f8f9fa;">
          <img src="${process.env.FRONTEND_URL}/logo.png" alt="Frogtales" style="height: 40px;">
        </div>
        <div style="padding: 20px;">
          ${content}
        </div>
        <div style="text-align: center; padding: 20px; background-color: #f8f9fa; font-size: 12px; color: #666;">
          <p>You're receiving this email because you subscribed to Frogtales newsletters.</p>
          <p><a href="{{unsubscribe}}" style="color: #666;">Unsubscribe</a></p>
        </div>
      </div>
    `;
  }

  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private processEmailStats(rawStats: any[]): any {
    const totalStats = {
      delivered: 0,
      opens: 0,
      clicks: 0,
      bounces: 0,
      spam_reports: 0,
      unsubscribes: 0,
      unique_opens: 0,
      unique_clicks: 0
    };

    for (const stat of rawStats) {
      for (const metric of stat.stats) {
        totalStats.delivered += metric.metrics.delivered || 0;
        totalStats.opens += metric.metrics.opens || 0;
        totalStats.clicks += metric.metrics.clicks || 0;
        totalStats.bounces += metric.metrics.bounces || 0;
        totalStats.spam_reports += metric.metrics.spam_reports || 0;
        totalStats.unsubscribes += metric.metrics.unsubscribes || 0;
        totalStats.unique_opens += metric.metrics.unique_opens || 0;
        totalStats.unique_clicks += metric.metrics.unique_clicks || 0;
      }
    }

    return {
      ...totalStats,
      open_rate: totalStats.delivered > 0 ? (totalStats.unique_opens / totalStats.delivered * 100).toFixed(2) : 0,
      click_rate: totalStats.delivered > 0 ? (totalStats.unique_clicks / totalStats.delivered * 100).toFixed(2) : 0,
      bounce_rate: totalStats.delivered > 0 ? (totalStats.bounces / totalStats.delivered * 100).toFixed(2) : 0
    };
  }
}

const sendgridIntegration = new SendGridIntegration();
export default sendgridIntegration;