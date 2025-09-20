import { Pool } from 'pg';
import { ArticleAnalytics, ArticleAnalyticsData, ArticlePerformanceSummary, TimeSeriesAnalytics } from '../models/ArticleAnalytics';
import { AdRevenue, AdRevenueData, AdRevenueMetrics, MonthlyBreakdown } from '../models/AdRevenue';
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

export class AnalyticsService {
  private articleAnalytics: ArticleAnalytics;
  private adRevenue: AdRevenue;
  private subscriptionService: SubscriptionService;
  private emailService: EmailService;
  private pool: Pool;

  constructor(
    pool: Pool,
    subscriptionService: SubscriptionService,
    emailService: EmailService
  ) {
    this.pool = pool;
    this.articleAnalytics = new ArticleAnalytics(pool);
    this.adRevenue = new AdRevenue(pool);
    this.subscriptionService = subscriptionService;
    this.emailService = emailService;
  }

  // Dashboard Overview
  async getDashboardOverview(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<DashboardOverview> {
    const days = this.timeframeToDays(timeframe.period);

    // Get basic metrics
    const [
      aggregatedMetrics,
      topArticles,
      subscriptionStats,
      subscriberStats
    ] = await Promise.all([
      this.articleAnalytics.getAggregatedMetrics(creatorId, days),
      this.articleAnalytics.getTopPerformingArticles(creatorId, 5, days),
      this.subscriptionService.getSubscriptionStats(creatorId),
      this.emailService.getSubscriberStats()
    ]);

    // Calculate growth metrics if comparison period is provided
    let recentMetrics = { pageViewsGrowth: 0, revenueGrowth: 0, subscriberGrowth: 0 };
    if (timeframe.comparison) {
      recentMetrics = await this.calculateGrowthMetrics(creatorId, timeframe);
    }

    return {
      totalPageViews: aggregatedMetrics.total_page_views,
      totalUniqueVisitors: aggregatedMetrics.total_unique_visitors,
      totalRevenue: aggregatedMetrics.total_ad_revenue + subscriptionStats.monthlyRevenue,
      totalSubscribers: subscriptionStats.activeSubscriptions,
      totalNewsletterSubscribers: subscriberStats.active,
      topPerformingArticles: topArticles,
      recentMetrics
    };
  }

  // Revenue Analytics
  async getRevenueAnalytics(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<RevenueAnalytics> {
    const days = this.timeframeToDays(timeframe.period);

    // Get ad revenue metrics
    const adMetrics = await this.adRevenue.getMetrics(creatorId, days);

    // Get subscription revenue
    const subscriptionStats = await this.subscriptionService.getSubscriptionStats(creatorId);

    // Get affiliate revenue (from article analytics)
    const affiliateQuery = `
      SELECT COALESCE(SUM(als.commission_amount), 0) as affiliate_revenue
      FROM affiliate_link_stats als
      JOIN affiliate_links al ON als.link_id = al.id
      WHERE al.creator_id = $1
      AND als.conversion_date > NOW() - INTERVAL '${days} days'
      AND als.converted = true
    `;

    const affiliateResult = await this.pool.query(affiliateQuery, [creatorId]);
    const affiliateRevenue = parseInt(affiliateResult.rows[0]?.affiliate_revenue || 0);

    const totalRevenue = adMetrics.total_revenue + subscriptionStats.monthlyRevenue + affiliateRevenue;

    // Get monthly trend
    const monthlyTrend = await this.getMonthlyRevenueTrend(creatorId, 12);

    // Get top revenue articles
    const topRevenueArticles = await this.getTopRevenueArticles(creatorId, 10, days);

    return {
      totalRevenue,
      adRevenue: adMetrics.total_revenue,
      subscriptionRevenue: subscriptionStats.monthlyRevenue,
      affiliateRevenue,
      revenueBreakdown: {
        ads: totalRevenue > 0 ? (adMetrics.total_revenue / totalRevenue) * 100 : 0,
        subscriptions: totalRevenue > 0 ? (subscriptionStats.monthlyRevenue / totalRevenue) * 100 : 0,
        affiliates: totalRevenue > 0 ? (affiliateRevenue / totalRevenue) * 100 : 0
      },
      monthlyTrend,
      topRevenueArticles
    };
  }

  // Traffic Analytics
  async getTrafficAnalytics(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<TrafficAnalytics> {
    const days = this.timeframeToDays(timeframe.period);

    // Get aggregated traffic metrics
    const aggregatedMetrics = await this.articleAnalytics.getAggregatedMetrics(creatorId, days);

    // For now, we'll return mock data for traffic sources, devices, and geographic data
    // In a real implementation, these would come from Google Analytics or similar services
    const topTrafficSources = [
      { source: 'Organic Search', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.45), percentage: 45 },
      { source: 'Direct', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.25), percentage: 25 },
      { source: 'Social Media', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.20), percentage: 20 },
      { source: 'Referral', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.10), percentage: 10 }
    ];

    const deviceBreakdown = [
      { device: 'Desktop', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.55), percentage: 55 },
      { device: 'Mobile', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.35), percentage: 35 },
      { device: 'Tablet', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.10), percentage: 10 }
    ];

    const geographicData = [
      { country: 'United States', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.40), percentage: 40 },
      { country: 'United Kingdom', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.15), percentage: 15 },
      { country: 'Canada', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.10), percentage: 10 },
      { country: 'Australia', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.08), percentage: 8 },
      { country: 'Germany', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.07), percentage: 7 },
      { country: 'Other', visitors: Math.floor(aggregatedMetrics.total_unique_visitors * 0.20), percentage: 20 }
    ];

    return {
      totalPageViews: aggregatedMetrics.total_page_views,
      totalUniqueVisitors: aggregatedMetrics.total_unique_visitors,
      averageTimeOnPage: aggregatedMetrics.avg_time_on_page,
      averageBounceRate: aggregatedMetrics.avg_bounce_rate,
      topTrafficSources,
      deviceBreakdown,
      geographicData
    };
  }

  // Engagement Analytics
  async getEngagementAnalytics(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<EngagementAnalytics> {
    const days = this.timeframeToDays(timeframe.period);

    // Get engagement metrics
    const aggregatedMetrics = await this.articleAnalytics.getAggregatedMetrics(creatorId, days);
    const subscriberStats = await this.emailService.getSubscriberStats();
    const subscriptionStats = await this.subscriptionService.getSubscriptionStats(creatorId);

    // Calculate engagement rate
    const engagementActions = aggregatedMetrics.total_social_shares +
                             aggregatedMetrics.total_newsletter_signups +
                             aggregatedMetrics.total_affiliate_clicks;
    const engagementRate = aggregatedMetrics.total_unique_visitors > 0
      ? (engagementActions / aggregatedMetrics.total_unique_visitors) * 100
      : 0;

    // Mock social platform data (in real implementation, this would come from social APIs)
    const topSocialPlatforms = [
      { platform: 'Twitter', shares: Math.floor(aggregatedMetrics.total_social_shares * 0.40), percentage: 40 },
      { platform: 'LinkedIn', shares: Math.floor(aggregatedMetrics.total_social_shares * 0.25), percentage: 25 },
      { platform: 'Facebook', shares: Math.floor(aggregatedMetrics.total_social_shares * 0.20), percentage: 20 },
      { platform: 'Reddit', shares: Math.floor(aggregatedMetrics.total_social_shares * 0.15), percentage: 15 }
    ];

    // Conversion funnel
    const conversionFunnel = {
      visitors: aggregatedMetrics.total_unique_visitors,
      emailSignups: aggregatedMetrics.total_newsletter_signups,
      subscriptions: subscriptionStats.activeSubscriptions,
      conversionRate: aggregatedMetrics.total_unique_visitors > 0
        ? (subscriptionStats.activeSubscriptions / aggregatedMetrics.total_unique_visitors) * 100
        : 0
    };

    return {
      totalSocialShares: aggregatedMetrics.total_social_shares,
      totalNewsletterSignups: aggregatedMetrics.total_newsletter_signups,
      totalAffiliateClicks: aggregatedMetrics.total_affiliate_clicks,
      engagementRate,
      topSocialPlatforms,
      conversionFunnel
    };
  }

  // Content Performance
  async getContentPerformance(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<ContentPerformance> {
    const days = this.timeframeToDays(timeframe.period);

    // Get article counts
    const articleCountQuery = `
      SELECT
        COUNT(*) as total_articles,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as published_articles,
        AVG(reading_time) as average_reading_time
      FROM articles
      WHERE author_id = $1
    `;

    const articleCountResult = await this.pool.query(articleCountQuery, [creatorId]);
    const articleStats = articleCountResult.rows[0];

    // Get top performing articles
    const topPerforming = await this.articleAnalytics.getTopPerformingArticles(creatorId, 10, days);

    // Get content categories (using tags as categories)
    const categoryQuery = `
      SELECT
        tag as category,
        COUNT(*) as articles,
        COALESCE(SUM(aa.page_views), 0) as total_views,
        COALESCE(AVG(aa.page_views), 0) as average_views
      FROM articles a
      JOIN LATERAL unnest(a.tags) AS tag ON true
      LEFT JOIN article_analytics aa ON a.id = aa.article_id
        AND aa.date > NOW() - INTERVAL '${days} days'
      WHERE a.author_id = $1 AND a.status = 'published'
      GROUP BY tag
      ORDER BY total_views DESC
      LIMIT 10
    `;

    const categoryResult = await this.pool.query(categoryQuery, [creatorId]);
    const contentCategories = categoryResult.rows.map(row => ({
      category: row.category,
      articles: parseInt(row.articles),
      totalViews: parseInt(row.total_views),
      averageViews: parseFloat(row.average_views)
    }));

    // Get publishing trend
    const publishingTrendQuery = `
      SELECT
        TO_CHAR(a.published_at, 'YYYY-MM') as month,
        COUNT(*) as published,
        COALESCE(SUM(aa.page_views), 0) as total_views
      FROM articles a
      LEFT JOIN article_analytics aa ON a.id = aa.article_id
      WHERE a.author_id = $1
      AND a.status = 'published'
      AND a.published_at > NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(a.published_at, 'YYYY-MM')
      ORDER BY month ASC
    `;

    const publishingTrendResult = await this.pool.query(publishingTrendQuery, [creatorId]);
    const publishingTrend = publishingTrendResult.rows.map(row => ({
      month: row.month,
      published: parseInt(row.published),
      totalViews: parseInt(row.total_views)
    }));

    return {
      totalArticles: parseInt(articleStats.total_articles),
      publishedArticles: parseInt(articleStats.published_articles),
      averageReadingTime: parseFloat(articleStats.average_reading_time) || 0,
      topPerforming,
      contentCategories,
      publishingTrend
    };
  }

  // Article Analytics
  async getArticleAnalytics(articleId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<{
    summary: ArticlePerformanceSummary;
    timeSeries: TimeSeriesAnalytics[];
    metrics: ArticleAnalyticsData[];
  }> {
    const days = this.timeframeToDays(timeframe.period);

    const [summary, timeSeries, metrics] = await Promise.all([
      this.articleAnalytics.getPerformanceSummary(articleId, days),
      this.articleAnalytics.getTimeSeriesData(articleId, days),
      this.articleAnalytics.findByArticleId(articleId)
    ]);

    return {
      summary: summary!,
      timeSeries,
      metrics: metrics.slice(0, days) // Limit to timeframe
    };
  }

  // Real-time Analytics
  async trackPageView(articleId: string, userId?: string, metadata?: Record<string, any>): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.articleAnalytics.incrementPageView(articleId, today);

    // Track unique visitor if user is identified or using session tracking
    if (userId || metadata?.sessionId) {
      // In a real implementation, you'd check if this user/session already viewed today
      await this.articleAnalytics.incrementUniqueVisitor(articleId, today);
    }
  }

  async trackSocialShare(articleId: string, platform: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.articleAnalytics.incrementSocialShare(articleId, today);
  }

  async trackNewsletterSignup(articleId: string, subscriberEmail: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.articleAnalytics.incrementNewsletterSignup(articleId, today);
  }

  async trackAffiliateClick(articleId: string, linkId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.articleAnalytics.incrementAffiliateClick(articleId, today);
  }

  async recordAdRevenue(creatorId: string, source: 'adsense' | 'media_net' | 'direct', revenue: number, impressions?: number, clicks?: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.adRevenue.addRevenue(creatorId, today, source, revenue, impressions, clicks);
  }

  // Comparison and Growth Analysis
  async compareMetrics(creatorId: string, metric: 'pageViews' | 'revenue' | 'subscribers', currentPeriod: string, comparisonPeriod: string): Promise<MetricComparisonResult> {
    const currentDays = this.timeframeToDays(currentPeriod as any);
    const comparisonDays = this.timeframeToDays(comparisonPeriod as any);

    let current = 0;
    let previous = 0;

    switch (metric) {
      case 'pageViews':
        const currentMetrics = await this.articleAnalytics.getAggregatedMetrics(creatorId, currentDays);
        const previousMetrics = await this.articleAnalytics.getAggregatedMetrics(creatorId, comparisonDays);
        current = currentMetrics.total_page_views;
        previous = previousMetrics.total_page_views - current; // Subtract overlap
        break;

      case 'revenue':
        const currentAdRevenue = await this.adRevenue.getMetrics(creatorId, currentDays);
        const previousAdRevenue = await this.adRevenue.getMetrics(creatorId, comparisonDays);
        current = currentAdRevenue.total_revenue;
        previous = previousAdRevenue.total_revenue - current;
        break;

      case 'subscribers':
        const currentStats = await this.subscriptionService.getSubscriptionStats(creatorId);
        // For simplicity, we'll estimate previous based on churn
        current = currentStats.activeSubscriptions;
        previous = Math.floor(current * 0.9); // Rough estimate
        break;
    }

    const growth = current - previous;
    const growthPercentage = previous > 0 ? (growth / previous) * 100 : 0;

    return {
      current,
      previous,
      growth,
      growthPercentage
    };
  }

  // Export and Reporting
  async generateAnalyticsReport(creatorId: string, timeframe: AnalyticsTimeframe = { period: '30d' }): Promise<{
    overview: DashboardOverview;
    revenue: RevenueAnalytics;
    traffic: TrafficAnalytics;
    engagement: EngagementAnalytics;
    content: ContentPerformance;
    generatedAt: Date;
  }> {
    const [overview, revenue, traffic, engagement, content] = await Promise.all([
      this.getDashboardOverview(creatorId, timeframe),
      this.getRevenueAnalytics(creatorId, timeframe),
      this.getTrafficAnalytics(creatorId, timeframe),
      this.getEngagementAnalytics(creatorId, timeframe),
      this.getContentPerformance(creatorId, timeframe)
    ]);

    return {
      overview,
      revenue,
      traffic,
      engagement,
      content,
      generatedAt: new Date()
    };
  }

  // Private Helper Methods
  private timeframeToDays(period: '7d' | '30d' | '90d' | '1y' | 'all'): number {
    switch (period) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      case 'all': return 999999; // Large number for "all time"
      default: return 30;
    }
  }

  private async calculateGrowthMetrics(creatorId: string, timeframe: AnalyticsTimeframe): Promise<{
    pageViewsGrowth: number;
    revenueGrowth: number;
    subscriberGrowth: number;
  }> {
    const currentDays = this.timeframeToDays(timeframe.period);
    const comparisonDays = this.timeframeToDays(timeframe.comparison!);

    const [pageViewsComparison, revenueComparison, subscriberComparison] = await Promise.all([
      this.compareMetrics(creatorId, 'pageViews', timeframe.period, timeframe.comparison!),
      this.compareMetrics(creatorId, 'revenue', timeframe.period, timeframe.comparison!),
      this.compareMetrics(creatorId, 'subscribers', timeframe.period, timeframe.comparison!)
    ]);

    return {
      pageViewsGrowth: pageViewsComparison.growthPercentage,
      revenueGrowth: revenueComparison.growthPercentage,
      subscriberGrowth: subscriberComparison.growthPercentage
    };
  }

  private async getMonthlyRevenueTrend(creatorId: string, months: number): Promise<Array<{
    month: string;
    total: number;
    ads: number;
    subscriptions: number;
    affiliates: number;
  }>> {
    // Get ad revenue breakdown
    const adBreakdown = await this.adRevenue.getMonthlyBreakdown(creatorId, months);

    // Get subscription revenue (simplified - assumes stable monthly revenue)
    const subscriptionStats = await this.subscriptionService.getSubscriptionStats(creatorId);
    const monthlySubscriptionRevenue = subscriptionStats.monthlyRevenue;

    // Get affiliate revenue by month
    const affiliateQuery = `
      SELECT
        TO_CHAR(conversion_date, 'YYYY-MM') as month,
        COALESCE(SUM(commission_amount), 0) as affiliate_revenue
      FROM affiliate_link_stats als
      JOIN affiliate_links al ON als.link_id = al.id
      WHERE al.creator_id = $1
      AND conversion_date > NOW() - INTERVAL '${months} months'
      AND converted = true
      GROUP BY TO_CHAR(conversion_date, 'YYYY-MM')
      ORDER BY month ASC
    `;

    const affiliateResult = await this.pool.query(affiliateQuery, [creatorId]);
    const affiliateByMonth = new Map(
      affiliateResult.rows.map(row => [row.month, parseInt(row.affiliate_revenue)])
    );

    return adBreakdown.map(ad => {
      const affiliateRevenue = affiliateByMonth.get(ad.month) || 0;
      return {
        month: ad.month,
        total: ad.total + monthlySubscriptionRevenue + affiliateRevenue,
        ads: ad.total,
        subscriptions: monthlySubscriptionRevenue,
        affiliates: affiliateRevenue
      };
    });
  }

  private async getTopRevenueArticles(creatorId: string, limit: number, days: number): Promise<Array<{
    articleId: string;
    title: string;
    revenue: number;
  }>> {
    const query = `
      SELECT
        a.id as article_id,
        a.title,
        COALESCE(SUM(aa.ad_revenue), 0) as revenue
      FROM articles a
      LEFT JOIN article_analytics aa ON a.id = aa.article_id
        AND aa.date > NOW() - INTERVAL '${days} days'
      WHERE a.author_id = $1 AND a.status = 'published'
      GROUP BY a.id, a.title
      ORDER BY revenue DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [creatorId, limit]);

    return result.rows.map(row => ({
      articleId: row.article_id,
      title: row.title,
      revenue: parseInt(row.revenue)
    }));
  }

  // Static utility methods
  static formatMetric(value: number, type: 'currency' | 'number' | 'percentage', currency = 'USD'): string {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency
        }).format(value / 100); // Assuming value is in cents

      case 'percentage':
        return `${Math.round(value * 100) / 100}%`;

      case 'number':
      default:
        return new Intl.NumberFormat('en-US').format(value);
    }
  }

  static calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  static getPerformanceLevel(value: number, thresholds: { good: number; excellent: number }): 'poor' | 'average' | 'good' | 'excellent' {
    if (value >= thresholds.excellent) return 'excellent';
    if (value >= thresholds.good) return 'good';
    if (value >= thresholds.good * 0.5) return 'average';
    return 'poor';
  }
}