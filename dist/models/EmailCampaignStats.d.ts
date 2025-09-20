import { Pool } from 'pg';
export interface EmailCampaignStatsData {
    id?: string;
    campaign_id: string;
    subscriber_id: string;
    delivered_at?: Date;
    opened_at?: Date;
    clicked_at?: Date;
    unsubscribed_at?: Date;
}
export interface CreateEmailCampaignStatsData {
    campaign_id: string;
    subscriber_id: string;
    delivered_at?: Date;
}
export interface UpdateEmailCampaignStatsData {
    delivered_at?: Date;
    opened_at?: Date;
    clicked_at?: Date;
    unsubscribed_at?: Date;
}
export interface EmailCampaignStatsFilters {
    campaign_id?: string;
    subscriber_id?: string;
    delivered?: boolean;
    opened?: boolean;
    clicked?: boolean;
    unsubscribed?: boolean;
    limit?: number;
    offset?: number;
}
export interface CampaignPerformanceMetrics {
    campaign_id: string;
    campaign_name: string;
    total_sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    delivery_rate: number;
    open_rate: number;
    click_rate: number;
    unsubscribe_rate: number;
}
export declare class EmailCampaignStats {
    private pool;
    constructor(pool: Pool);
    create(statsData: CreateEmailCampaignStatsData): Promise<EmailCampaignStatsData>;
    findById(id: string): Promise<EmailCampaignStatsData | null>;
    findByCampaignAndSubscriber(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null>;
    findByCampaignId(campaignId: string): Promise<EmailCampaignStatsData[]>;
    findBySubscriberId(subscriberId: string): Promise<EmailCampaignStatsData[]>;
    findMany(filters?: EmailCampaignStatsFilters): Promise<{
        stats: EmailCampaignStatsData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateEmailCampaignStatsData): Promise<EmailCampaignStatsData | null>;
    markDelivered(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null>;
    markOpened(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null>;
    markClicked(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null>;
    markUnsubscribed(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null>;
    getCampaignPerformance(campaignId: string): Promise<CampaignPerformanceMetrics | null>;
    getSubscriberEngagement(subscriberId: string, days?: number): Promise<{
        total_emails: number;
        delivered: number;
        opened: number;
        clicked: number;
        engagement_score: number;
    }>;
    bulkCreate(statsDataArray: CreateEmailCampaignStatsData[]): Promise<EmailCampaignStatsData[]>;
    delete(id: string): Promise<boolean>;
    deleteByCampaign(campaignId: string): Promise<number>;
    static calculateEngagementScore(opened: number, clicked: number, delivered: number): number;
    static isEngaged(openedAt: Date | null, clickedAt: Date | null): boolean;
    static isHighlyEngaged(openedAt: Date | null, clickedAt: Date | null): boolean;
}
//# sourceMappingURL=EmailCampaignStats.d.ts.map