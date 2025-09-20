import { Pool } from 'pg';
import { EmailCampaignData, CreateEmailCampaignData, UpdateEmailCampaignData, EmailCampaignStats } from '../models/EmailCampaign';
import { SubscriberData, CreateSubscriberData, SubscriberFilters } from '../models/Subscriber';
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
    send_at?: number;
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
export declare class EmailService {
    private emailCampaign;
    private subscriber;
    private pool;
    private sendgridApiKey;
    constructor(pool: Pool, sendgridApiKey?: string);
    createCampaign(campaignData: CreateEmailCampaignData): Promise<EmailCampaignData>;
    updateCampaign(campaignId: string, updateData: UpdateEmailCampaignData, creatorId?: string): Promise<EmailCampaignData>;
    getCampaign(campaignId: string, creatorId?: string): Promise<EmailCampaignData | null>;
    getCampaigns(creatorId: string): Promise<EmailCampaignData[]>;
    duplicateCampaign(campaignId: string, newName: string, creatorId?: string): Promise<EmailCampaignData | null>;
    deleteCampaign(campaignId: string, creatorId?: string): Promise<void>;
    addSubscriber(subscriberData: CreateSubscriberData): Promise<SubscriberData>;
    unsubscribeByEmail(email: string): Promise<SubscriberData | null>;
    getSubscribers(filters?: SubscriberFilters): Promise<{
        subscribers: SubscriberData[];
        total: number;
    }>;
    getSubscriberStats(): Promise<{
        active: number;
        total: number;
        bounceRate: number;
    }>;
    sendSingleEmail(request: SendEmailRequest): Promise<SendResult>;
    sendBulkEmail(request: BulkEmailRequest): Promise<{
        sent: number;
        failed: number;
        errors: string[];
    }>;
    scheduleCampaign(campaignId: string, scheduledAt: Date, creatorId?: string): Promise<EmailCampaignData>;
    getCampaignStats(creatorId: string): Promise<EmailCampaignStats>;
    getCampaignAnalytics(campaignId: string, creatorId?: string): Promise<EmailStats>;
    sendWelcomeEmail(subscriber: SubscriberData): Promise<void>;
    sendArticleNotification(articleId: string, articleTitle: string, articleUrl: string): Promise<void>;
    handleSendGridWebhook(events: any[]): Promise<void>;
    private personalizeContent;
    private recordEmailDelivery;
    private getWelcomeTemplate;
    private getArticleNotificationTemplate;
    private processSendGridEvent;
    private recordEmailOpen;
    private recordEmailClick;
    private recordEmailUnsubscribe;
    private handleEmailBounce;
    static validateEmailContent(content: string): {
        valid: boolean;
        message?: string;
    };
    static extractTextFromHtml(html: string): string;
}
//# sourceMappingURL=EmailService.d.ts.map