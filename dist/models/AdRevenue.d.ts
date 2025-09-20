import { Pool } from 'pg';
export interface AdRevenueData {
    id?: string;
    creator_id: string;
    date: Date;
    source: 'adsense' | 'media_net' | 'direct';
    revenue: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    rpm?: number;
}
export interface CreateAdRevenueData {
    creator_id: string;
    date: Date;
    source: 'adsense' | 'media_net' | 'direct';
    revenue: number;
    impressions?: number;
    clicks?: number;
}
export interface UpdateAdRevenueData {
    revenue?: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    rpm?: number;
}
export interface AdRevenueFilters {
    creator_id?: string;
    source?: 'adsense' | 'media_net' | 'direct';
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
}
export interface AdRevenueMetrics {
    total_revenue: number;
    total_impressions: number;
    total_clicks: number;
    avg_ctr: number;
    avg_rpm: number;
    revenue_by_source: Array<{
        source: string;
        revenue: number;
        percentage: number;
    }>;
}
export interface MonthlyBreakdown {
    month: string;
    total: number;
    adsense: number;
    media_net: number;
    direct: number;
}
export declare class AdRevenue {
    private pool;
    constructor(pool: Pool);
    create(revenueData: CreateAdRevenueData): Promise<AdRevenueData>;
    findById(id: string): Promise<AdRevenueData | null>;
    findByCreatorAndDate(creatorId: string, date: Date, source?: string): Promise<AdRevenueData | null>;
    findByCreatorId(creatorId: string): Promise<AdRevenueData[]>;
    findMany(filters?: AdRevenueFilters): Promise<{
        revenue: AdRevenueData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateAdRevenueData): Promise<AdRevenueData | null>;
    upsert(revenueData: CreateAdRevenueData): Promise<AdRevenueData>;
    getMetrics(creatorId: string, days?: number): Promise<AdRevenueMetrics>;
    getMonthlyBreakdown(creatorId: string, months?: number): Promise<MonthlyBreakdown[]>;
    getDailyRevenue(creatorId: string, date: Date): Promise<number>;
    getMonthlyRevenue(creatorId: string, year: number, month: number): Promise<number>;
    getTopPerformingDays(creatorId: string, limit?: number, days?: number): Promise<Array<{
        date: string;
        revenue: number;
        impressions: number;
        clicks: number;
        ctr: number;
        rpm: number;
    }>>;
    getSourceComparison(creatorId: string, days?: number): Promise<Array<{
        source: string;
        revenue: number;
        impressions: number;
        clicks: number;
        ctr: number;
        rpm: number;
        growth_rate: number;
    }>>;
    addRevenue(creatorId: string, date: Date, source: 'adsense' | 'media_net' | 'direct', revenue: number, impressions?: number, clicks?: number): Promise<AdRevenueData>;
    delete(id: string): Promise<boolean>;
    deleteByCreatorId(creatorId: string): Promise<number>;
    deleteOldRevenue(daysToKeep?: number): Promise<number>;
    private calculateCTR;
    private calculateRPM;
    static validateSource(source: string): boolean;
    static validateRevenue(revenue: number): boolean;
    static validateImpressions(impressions: number): boolean;
    static validateClicks(clicks: number): boolean;
    static formatRevenue(revenueInCents: number, currency?: string): string;
    static formatCTR(ctr: number): string;
    static formatRPM(rpm: number, currency?: string): string;
    static isHighPerformance(ctr: number, rpm: number): boolean;
    static getRevenueGrowth(current: number, previous: number): number;
}
//# sourceMappingURL=AdRevenue.d.ts.map