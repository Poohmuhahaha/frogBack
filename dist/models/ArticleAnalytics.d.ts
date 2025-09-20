import { Pool } from 'pg';
export interface ArticleAnalyticsData {
    id?: string;
    article_id: string;
    date: Date;
    page_views?: number;
    unique_visitors?: number;
    avg_time_on_page?: number;
    bounce_rate?: number;
    social_shares?: number;
    ad_revenue?: number;
    affiliate_clicks?: number;
    newsletter_signups?: number;
}
export interface CreateArticleAnalyticsData {
    article_id: string;
    date: Date;
    page_views?: number;
    unique_visitors?: number;
    avg_time_on_page?: number;
    bounce_rate?: number;
    social_shares?: number;
    ad_revenue?: number;
    affiliate_clicks?: number;
    newsletter_signups?: number;
}
export interface UpdateArticleAnalyticsData {
    page_views?: number;
    unique_visitors?: number;
    avg_time_on_page?: number;
    bounce_rate?: number;
    social_shares?: number;
    ad_revenue?: number;
    affiliate_clicks?: number;
    newsletter_signups?: number;
}
export interface ArticleAnalyticsFilters {
    article_id?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
}
export interface ArticlePerformanceSummary {
    article_id: string;
    article_title: string;
    total_page_views: number;
    total_unique_visitors: number;
    avg_time_on_page: number;
    avg_bounce_rate: number;
    total_social_shares: number;
    total_ad_revenue: number;
    total_affiliate_clicks: number;
    total_newsletter_signups: number;
    performance_score: number;
}
export interface TimeSeriesAnalytics {
    date: string;
    page_views: number;
    unique_visitors: number;
    avg_time_on_page: number;
    bounce_rate: number;
    social_shares: number;
    ad_revenue: number;
    affiliate_clicks: number;
    newsletter_signups: number;
}
export declare class ArticleAnalytics {
    private pool;
    constructor(pool: Pool);
    create(analyticsData: CreateArticleAnalyticsData): Promise<ArticleAnalyticsData>;
    findById(id: string): Promise<ArticleAnalyticsData | null>;
    findByArticleAndDate(articleId: string, date: Date): Promise<ArticleAnalyticsData | null>;
    findByArticleId(articleId: string): Promise<ArticleAnalyticsData[]>;
    findMany(filters?: ArticleAnalyticsFilters): Promise<{
        analytics: ArticleAnalyticsData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateArticleAnalyticsData): Promise<ArticleAnalyticsData | null>;
    upsert(analyticsData: CreateArticleAnalyticsData): Promise<ArticleAnalyticsData>;
    incrementPageView(articleId: string, date: Date): Promise<ArticleAnalyticsData>;
    incrementUniqueVisitor(articleId: string, date: Date): Promise<ArticleAnalyticsData>;
    incrementSocialShare(articleId: string, date: Date): Promise<ArticleAnalyticsData>;
    incrementAffiliateClick(articleId: string, date: Date): Promise<ArticleAnalyticsData>;
    incrementNewsletterSignup(articleId: string, date: Date): Promise<ArticleAnalyticsData>;
    addRevenue(articleId: string, date: Date, revenueInCents: number): Promise<ArticleAnalyticsData>;
    getPerformanceSummary(articleId: string, days?: number): Promise<ArticlePerformanceSummary | null>;
    getTimeSeriesData(articleId: string, days?: number): Promise<TimeSeriesAnalytics[]>;
    getTopPerformingArticles(creatorId: string, limit?: number, days?: number): Promise<ArticlePerformanceSummary[]>;
    getAggregatedMetrics(creatorId: string, days?: number): Promise<{
        total_page_views: number;
        total_unique_visitors: number;
        avg_time_on_page: number;
        avg_bounce_rate: number;
        total_social_shares: number;
        total_ad_revenue: number;
        total_affiliate_clicks: number;
        total_newsletter_signups: number;
    }>;
    delete(id: string): Promise<boolean>;
    deleteByArticleId(articleId: string): Promise<number>;
    deleteOldAnalytics(daysToKeep?: number): Promise<number>;
    private calculatePerformanceScore;
    static formatTimeOnPage(seconds: number): string;
    static formatBounceRate(rate: number): string;
    static isHighPerformance(score: number): boolean;
    static getPerformanceLevel(score: number): 'excellent' | 'good' | 'average' | 'poor';
}
//# sourceMappingURL=ArticleAnalytics.d.ts.map