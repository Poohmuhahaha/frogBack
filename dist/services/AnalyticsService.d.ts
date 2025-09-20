import { Pool } from 'pg';
import { ArticleAnalyticsData, ArticlePerformanceSummary, TimeSeriesAnalytics } from '../models/ArticleAnalytics';
import { SubscriptionService } from './SubscriptionService';
import { EmailService } from './EmailService';
export interface DashboardOverview {
    totalPageViews: number;
    totalUniqueVisitors: number;
    totalRevenue: number;
    totalSubscribers: number;
    totalNewsletterSubscribers: number;
    topPerformingArticles: ArticlePerformanceSummary[];
    recentMetrics: {
        pageViewsGrowth: number;
        revenueGrowth: number;
        subscriberGrowth: number;
    };
}
export interface RevenueAnalytics {
    totalRevenue: number;
    adRevenue: number;
    subscriptionRevenue: number;
    affiliateRevenue: number;
    revenueBreakdown: {
        ads: number;
        subscriptions: number;
        affiliates: number;
    };
    monthlyTrend: Array<{
        month: string;
        total: number;
        ads: number;
        subscriptions: number;
        affiliates: number;
    }>;
    topRevenueArticles: Array<{
        articleId: string;
        title: string;
        revenue: number;
    }>;
}
export interface TrafficAnalytics {
    totalPageViews: number;
    totalUniqueVisitors: number;
    averageTimeOnPage: number;
    averageBounceRate: number;
    topTrafficSources: Array<{
        source: string;
        visitors: number;
        percentage: number;
    }>;
    deviceBreakdown: Array<{
        device: string;
        visitors: number;
        percentage: number;
    }>;
    geographicData: Array<{
        country: string;
        visitors: number;
        percentage: number;
    }>;
}
export interface EngagementAnalytics {
    totalSocialShares: number;
    totalNewsletterSignups: number;
    totalAffiliateClicks: number;
    engagementRate: number;
    topSocialPlatforms: Array<{
        platform: string;
        shares: number;
        percentage: number;
    }>;
    conversionFunnel: {
        visitors: number;
        emailSignups: number;
        subscriptions: number;
        conversionRate: number;
    };
}
export interface ContentPerformance {
    totalArticles: number;
    publishedArticles: number;
    averageReadingTime: number;
    topPerforming: ArticlePerformanceSummary[];
    contentCategories: Array<{
        category: string;
        articles: number;
        totalViews: number;
        averageViews: number;
    }>;
    publishingTrend: Array<{
        month: string;
        published: number;
        totalViews: number;
    }>;
}
export interface AnalyticsTimeframe {
    period: '7d' | '30d' | '90d' | '1y' | 'all';
    comparison?: '7d' | '30d' | '90d' | '1y';
}
export interface MetricComparisonResult {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
}
export declare class AnalyticsService {
    private articleAnalytics;
    private adRevenue;
    private subscriptionService;
    private emailService;
    private pool;
    constructor(pool: Pool, subscriptionService: SubscriptionService, emailService: EmailService);
    getDashboardOverview(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<DashboardOverview>;
    getRevenueAnalytics(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<RevenueAnalytics>;
    getTrafficAnalytics(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<TrafficAnalytics>;
    getEngagementAnalytics(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<EngagementAnalytics>;
    getContentPerformance(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<ContentPerformance>;
    getArticleAnalytics(articleId: string, timeframe?: AnalyticsTimeframe): Promise<{
        summary: ArticlePerformanceSummary;
        timeSeries: TimeSeriesAnalytics[];
        metrics: ArticleAnalyticsData[];
    }>;
    trackPageView(articleId: string, userId?: string, metadata?: Record<string, any>): Promise<void>;
    trackSocialShare(articleId: string, platform: string): Promise<void>;
    trackNewsletterSignup(articleId: string, subscriberEmail: string): Promise<void>;
    trackAffiliateClick(articleId: string, linkId: string): Promise<void>;
    recordAdRevenue(creatorId: string, source: 'adsense' | 'media_net' | 'direct', revenue: number, impressions?: number, clicks?: number): Promise<void>;
    compareMetrics(creatorId: string, metric: 'pageViews' | 'revenue' | 'subscribers', currentPeriod: string, comparisonPeriod: string): Promise<MetricComparisonResult>;
    generateAnalyticsReport(creatorId: string, timeframe?: AnalyticsTimeframe): Promise<{
        overview: DashboardOverview;
        revenue: RevenueAnalytics;
        traffic: TrafficAnalytics;
        engagement: EngagementAnalytics;
        content: ContentPerformance;
        generatedAt: Date;
    }>;
    private timeframeToDays;
    private calculateGrowthMetrics;
    private getMonthlyRevenueTrend;
    private getTopRevenueArticles;
    static formatMetric(value: number, type: 'currency' | 'number' | 'percentage', currency?: string): string;
    static calculateGrowthRate(current: number, previous: number): number;
    static getPerformanceLevel(value: number, thresholds: {
        good: number;
        excellent: number;
    }): 'poor' | 'average' | 'good' | 'excellent';
}
//# sourceMappingURL=AnalyticsService.d.ts.map