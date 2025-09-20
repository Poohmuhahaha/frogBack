import { Pool } from 'pg';
import { AffiliateLinkData, UpdateAffiliateLinkData, AffiliateLinkPerformance, AffiliateLinkFilters } from '../models/AffiliateLink';
import { AffiliateLinkStatsData, CreateAffiliateLinkStatsData, ClickAnalytics, TimeSeriesData } from '../models/AffiliateLinkStats';
export interface CreateLinkRequest {
    name: string;
    originalUrl: string;
    network: 'amazon' | 'shareasale' | 'cj' | 'custom';
    commissionRate?: number;
    category?: string;
}
export interface TrackClickRequest {
    trackingCode: string;
    articleId?: string;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    redirectUrl?: string;
}
export interface ConversionData {
    trackingCode: string;
    orderId?: string;
    commissionAmount: number;
    conversionDate?: Date;
    metadata?: Record<string, any>;
}
export interface LinkAnalytics {
    link: AffiliateLinkData;
    performance: AffiliateLinkPerformance;
    clickAnalytics: ClickAnalytics;
    timeSeries: TimeSeriesData[];
    topArticles: Array<{
        articleId: string;
        articleTitle: string;
        clicks: number;
        conversions: number;
        conversionRate: number;
        commission: number;
    }>;
}
export interface NetworkPerformance {
    network: string;
    totalLinks: number;
    totalClicks: number;
    totalConversions: number;
    totalCommission: number;
    conversionRate: number;
    averageCommissionPerConversion: number;
}
export interface CreatorAffiliateSummary {
    totalLinks: number;
    activeLinks: number;
    totalClicks: number;
    totalConversions: number;
    totalCommission: number;
    conversionRate: number;
    topPerformingLinks: AffiliateLinkPerformance[];
    networkBreakdown: NetworkPerformance[];
    monthlyCommission: Array<{
        month: string;
        commission: number;
        clicks: number;
        conversions: number;
    }>;
}
export interface LinkOptimizationSuggestions {
    linkId: string;
    suggestions: Array<{
        type: 'placement' | 'timing' | 'content' | 'network';
        description: string;
        potentialImpact: 'low' | 'medium' | 'high';
        actionRequired: string;
    }>;
}
export declare class AffiliateService {
    private affiliateLink;
    private affiliateLinkStats;
    private pool;
    constructor(pool: Pool);
    createLink(creatorId: string, linkData: CreateLinkRequest): Promise<AffiliateLinkData>;
    updateLink(linkId: string, updateData: UpdateAffiliateLinkData, creatorId?: string): Promise<AffiliateLinkData>;
    getLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData | null>;
    getLinks(creatorId: string, filters?: AffiliateLinkFilters): Promise<{
        links: AffiliateLinkData[];
        total: number;
    }>;
    getTrackedUrl(trackingCode: string): Promise<string | null>;
    activateLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData>;
    deactivateLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData>;
    deleteLink(linkId: string, creatorId?: string): Promise<void>;
    regenerateTrackingCode(linkId: string, creatorId?: string): Promise<AffiliateLinkData>;
    trackClick(request: TrackClickRequest): Promise<{
        success: boolean;
        redirectUrl?: string;
        error?: string;
    }>;
    recordConversion(conversionData: ConversionData): Promise<void>;
    bulkRecordClicks(clicks: CreateAffiliateLinkStatsData[]): Promise<AffiliateLinkStatsData[]>;
    getLinkAnalytics(linkId: string, creatorId?: string, days?: number): Promise<LinkAnalytics>;
    getCreatorSummary(creatorId: string, days?: number): Promise<CreatorAffiliateSummary>;
    getNetworkPerformance(creatorId: string, days?: number): Promise<NetworkPerformance[]>;
    getMonthlyCommissionBreakdown(creatorId: string, months?: number): Promise<Array<{
        month: string;
        commission: number;
        clicks: number;
        conversions: number;
    }>>;
    getOptimizationSuggestions(linkId: string, creatorId?: string): Promise<LinkOptimizationSuggestions>;
    getLinkByTrackingCode(trackingCode: string): Promise<AffiliateLinkData | null>;
    buildTrackedUrl(linkId: string, baseUrl?: string): Promise<string | null>;
    getClickHistory(linkId: string, creatorId?: string, limit?: number): Promise<AffiliateLinkStatsData[]>;
    exportAnalytics(creatorId: string, format?: 'json' | 'csv', days?: number): Promise<any>;
    private convertAnalyticsToCSV;
    static validateTrackingCode(trackingCode: string): boolean;
    static extractProductInfo(url: string): {
        domain: string;
        productId?: string;
    };
    static generateShortCode(length?: number): string;
    static formatCommission(amountInCents: number, currency?: string): string;
    static calculateConversionRate(conversions: number, clicks: number): number;
    static getPerformanceLevel(conversionRate: number): 'poor' | 'average' | 'good' | 'excellent';
}
//# sourceMappingURL=AffiliateService.d.ts.map