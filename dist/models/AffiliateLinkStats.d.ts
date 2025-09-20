import { Pool } from 'pg';
export interface AffiliateLinkStatsData {
    id?: string;
    link_id: string;
    article_id?: string;
    clicked_at?: Date;
    ip_address?: string;
    user_agent?: string;
    referrer?: string;
    converted?: boolean;
    commission_amount?: number;
    conversion_date?: Date;
}
export interface CreateAffiliateLinkStatsData {
    link_id: string;
    article_id?: string;
    ip_address?: string;
    user_agent?: string;
    referrer?: string;
}
export interface UpdateAffiliateLinkStatsData {
    converted?: boolean;
    commission_amount?: number;
    conversion_date?: Date;
}
export interface AffiliateLinkStatsFilters {
    link_id?: string;
    article_id?: string;
    converted?: boolean;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
}
export interface ClickAnalytics {
    total_clicks: number;
    unique_clicks: number;
    conversions: number;
    conversion_rate: number;
    total_commission: number;
    avg_commission_per_conversion: number;
    top_sources: Array<{
        article_id: string;
        article_title: string;
        clicks: number;
        conversions: number;
    }>;
}
export interface TimeSeriesData {
    date: string;
    clicks: number;
    conversions: number;
    commission: number;
}
export declare class AffiliateLinkStats {
    private pool;
    constructor(pool: Pool);
    create(statsData: CreateAffiliateLinkStatsData): Promise<AffiliateLinkStatsData>;
    findById(id: string): Promise<AffiliateLinkStatsData | null>;
    findByLinkId(linkId: string): Promise<AffiliateLinkStatsData[]>;
    findByArticleId(articleId: string): Promise<AffiliateLinkStatsData[]>;
    findMany(filters?: AffiliateLinkStatsFilters): Promise<{
        stats: AffiliateLinkStatsData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateAffiliateLinkStatsData): Promise<AffiliateLinkStatsData | null>;
    markConverted(id: string, commissionAmount: number): Promise<AffiliateLinkStatsData | null>;
    getAnalytics(linkId: string, days?: number): Promise<ClickAnalytics>;
    getTimeSeriesData(linkId: string, days?: number): Promise<TimeSeriesData[]>;
    getTopPerformingArticles(linkId: string, limit?: number, days?: number): Promise<Array<{
        article_id: string;
        article_title: string;
        clicks: number;
        conversions: number;
        conversion_rate: number;
        commission: number;
    }>>;
    getDailyCommission(creatorId: string, date: Date): Promise<number>;
    getMonthlyCommission(creatorId: string, year: number, month: number): Promise<number>;
    trackClick(linkId: string, articleId?: string, ipAddress?: string, userAgent?: string, referrer?: string): Promise<AffiliateLinkStatsData>;
    bulkCreate(statsDataArray: CreateAffiliateLinkStatsData[]): Promise<AffiliateLinkStatsData[]>;
    delete(id: string): Promise<boolean>;
    deleteByLinkId(linkId: string): Promise<number>;
    deleteOldStats(daysToKeep?: number): Promise<number>;
    private hashIpAddress;
    static isUniqueClick(ipAddress: string, existingHashes: string[]): boolean;
    static extractReferrerDomain(referrer: string): string;
    static parseUserAgent(userAgent: string): {
        browser: string;
        os: string;
        device: string;
    };
}
//# sourceMappingURL=AffiliateLinkStats.d.ts.map