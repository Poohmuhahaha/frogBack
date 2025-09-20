import { Pool } from 'pg';
export interface EmailCampaignData {
    id?: string;
    creator_id: string;
    name: string;
    subject: string;
    content: string;
    type: 'newsletter' | 'automation' | 'announcement';
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    scheduled_at?: Date;
    sent_at?: Date;
    recipient_count?: number;
    open_rate?: number;
    click_rate?: number;
    created_at?: Date;
}
export interface CreateEmailCampaignData {
    creator_id: string;
    name: string;
    subject: string;
    content: string;
    type: 'newsletter' | 'automation' | 'announcement';
    scheduled_at?: Date;
}
export interface UpdateEmailCampaignData {
    name?: string;
    subject?: string;
    content?: string;
    type?: 'newsletter' | 'automation' | 'announcement';
    status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    scheduled_at?: Date;
    sent_at?: Date;
    recipient_count?: number;
    open_rate?: number;
    click_rate?: number;
}
export interface EmailCampaignFilters {
    creator_id?: string;
    type?: 'newsletter' | 'automation' | 'announcement';
    status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    limit?: number;
    offset?: number;
    search?: string;
}
export interface EmailCampaignStats {
    total_campaigns: number;
    sent_campaigns: number;
    avg_open_rate: number;
    avg_click_rate: number;
    total_recipients: number;
}
export declare class EmailCampaign {
    private pool;
    constructor(pool: Pool);
    create(campaignData: CreateEmailCampaignData): Promise<EmailCampaignData>;
    findById(id: string): Promise<EmailCampaignData | null>;
    findByCreatorId(creatorId: string): Promise<EmailCampaignData[]>;
    findMany(filters?: EmailCampaignFilters): Promise<{
        campaigns: EmailCampaignData[];
        total: number;
    }>;
    findScheduled(): Promise<EmailCampaignData[]>;
    update(id: string, updateData: UpdateEmailCampaignData): Promise<EmailCampaignData | null>;
    schedule(id: string, scheduledAt: Date): Promise<EmailCampaignData | null>;
    startSending(id: string, recipientCount: number): Promise<EmailCampaignData | null>;
    markSent(id: string): Promise<EmailCampaignData | null>;
    markFailed(id: string): Promise<EmailCampaignData | null>;
    updateStats(id: string): Promise<EmailCampaignData | null>;
    getStats(creatorId: string): Promise<EmailCampaignStats>;
    getRecentCampaigns(creatorId: string, limit?: number): Promise<EmailCampaignData[]>;
    duplicate(id: string, newName: string): Promise<EmailCampaignData | null>;
    delete(id: string): Promise<boolean>;
    static validateName(name: string): boolean;
    static validateSubject(subject: string): boolean;
    static validateContent(content: string): boolean;
    static validateType(type: string): boolean;
    static validateStatus(status: string): boolean;
    static canEdit(status: string): boolean;
    static canDelete(status: string): boolean;
    static canSend(status: string): boolean;
}
//# sourceMappingURL=EmailCampaign.d.ts.map