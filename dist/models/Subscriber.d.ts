import { Pool } from 'pg';
export interface SubscriberData {
    id?: string;
    email: string;
    name?: string;
    status: 'active' | 'unsubscribed' | 'bounced';
    source: 'website' | 'social' | 'referral' | 'import';
    tags?: string[];
    email_verified?: boolean;
    engagement_score?: number;
    last_opened?: Date;
    subscribed_at?: Date;
    unsubscribed_at?: Date;
}
export interface CreateSubscriberData {
    email: string;
    name?: string;
    source: 'website' | 'social' | 'referral' | 'import';
    tags?: string[];
}
export interface UpdateSubscriberData {
    name?: string;
    status?: 'active' | 'unsubscribed' | 'bounced';
    tags?: string[];
    email_verified?: boolean;
    engagement_score?: number;
    last_opened?: Date;
}
export interface SubscriberFilters {
    status?: 'active' | 'unsubscribed' | 'bounced';
    source?: 'website' | 'social' | 'referral' | 'import';
    tags?: string[];
    email_verified?: boolean;
    engagement_score_min?: number;
    engagement_score_max?: number;
    limit?: number;
    offset?: number;
    search?: string;
}
export declare class Subscriber {
    private pool;
    constructor(pool: Pool);
    create(subscriberData: CreateSubscriberData): Promise<SubscriberData>;
    findById(id: string): Promise<SubscriberData | null>;
    findByEmail(email: string): Promise<SubscriberData | null>;
    findMany(filters?: SubscriberFilters): Promise<{
        subscribers: SubscriberData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateSubscriberData): Promise<SubscriberData | null>;
    unsubscribe(id: string): Promise<SubscriberData | null>;
    unsubscribeByEmail(email: string): Promise<SubscriberData | null>;
    resubscribe(id: string): Promise<SubscriberData | null>;
    updateEngagementScore(id: string): Promise<SubscriberData | null>;
    emailExists(email: string): Promise<boolean>;
    getActiveCount(): Promise<number>;
    getBounceRate(): Promise<number>;
    delete(id: string): Promise<boolean>;
    static validateEmail(email: string): boolean;
    static validateSource(source: string): boolean;
    static validateStatus(status: string): boolean;
    static validateEngagementScore(score: number): boolean;
    static validateTags(tags: string[]): boolean;
}
//# sourceMappingURL=Subscriber.d.ts.map