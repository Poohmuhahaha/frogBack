import { Pool } from 'pg';
import { AffiliateLink, AffiliateLinkData, CreateAffiliateLinkData, UpdateAffiliateLinkData, AffiliateLinkPerformance, AffiliateLinkFilters } from '../models/AffiliateLink';
import { AffiliateLinkStats, AffiliateLinkStatsData, CreateAffiliateLinkStatsData, ClickAnalytics, TimeSeriesData } from '../models/AffiliateLinkStats';

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

export class AffiliateService {
  private affiliateLink: AffiliateLink;
  private affiliateLinkStats: AffiliateLinkStats;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.affiliateLink = new AffiliateLink(pool);
    this.affiliateLinkStats = new AffiliateLinkStats(pool);
  }

  // Link Management
  async createLink(creatorId: string, linkData: CreateLinkRequest): Promise<AffiliateLinkData> {
    // Validate link data
    if (!AffiliateLink.validateName(linkData.name)) {
      throw new Error('Invalid link name: must be 1-200 characters');
    }

    if (!AffiliateLink.validateUrl(linkData.originalUrl)) {
      throw new Error('Invalid URL: must be a valid HTTP/HTTPS URL');
    }

    if (!AffiliateLink.validateNetwork(linkData.network)) {
      throw new Error('Invalid network: must be one of amazon, shareasale, cj, custom');
    }

    if (linkData.commissionRate !== undefined && !AffiliateLink.validateCommissionRate(linkData.commissionRate)) {
      throw new Error('Invalid commission rate: must be between 0-100%');
    }

    if (linkData.category && !AffiliateLink.validateCategory(linkData.category)) {
      throw new Error('Invalid category: maximum 100 characters');
    }

    // Create the affiliate link
    const createData: CreateAffiliateLinkData = {
      creator_id: creatorId,
      name: linkData.name,
      original_url: linkData.originalUrl,
      network: linkData.network,
      commission_rate: linkData.commissionRate,
      category: linkData.category
    };

    return this.affiliateLink.create(createData);
  }

  async updateLink(linkId: string, updateData: UpdateAffiliateLinkData, creatorId?: string): Promise<AffiliateLinkData> {
    // Verify link exists and user has permission
    const existingLink = await this.affiliateLink.findById(linkId);
    if (!existingLink) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && existingLink.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only edit your own affiliate links');
    }

    // Validate update data
    if (updateData.name && !AffiliateLink.validateName(updateData.name)) {
      throw new Error('Invalid link name: must be 1-200 characters');
    }

    if (updateData.original_url && !AffiliateLink.validateUrl(updateData.original_url)) {
      throw new Error('Invalid URL: must be a valid HTTP/HTTPS URL');
    }

    if (updateData.commission_rate !== undefined && !AffiliateLink.validateCommissionRate(updateData.commission_rate)) {
      throw new Error('Invalid commission rate: must be between 0-100%');
    }

    if (updateData.category && !AffiliateLink.validateCategory(updateData.category)) {
      throw new Error('Invalid category: maximum 100 characters');
    }

    const updatedLink = await this.affiliateLink.update(linkId, updateData);
    if (!updatedLink) {
      throw new Error('Failed to update affiliate link');
    }

    return updatedLink;
  }

  async getLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData | null> {
    const link = await this.affiliateLink.findById(linkId);
    if (!link) {
      return null;
    }

    if (creatorId && link.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only view your own affiliate links');
    }

    return link;
  }

  async getLinks(creatorId: string, filters: AffiliateLinkFilters = {}): Promise<{ links: AffiliateLinkData[]; total: number }> {
    const searchFilters = {
      ...filters,
      creator_id: creatorId
    };

    return this.affiliateLink.findMany(searchFilters);
  }

  async getTrackedUrl(trackingCode: string): Promise<string | null> {
    const link = await this.affiliateLink.findByTrackingCode(trackingCode);
    if (!link || !link.is_active) {
      return null;
    }

    return this.affiliateLink.buildTrackedUrl(link.original_url, trackingCode);
  }

  async activateLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData> {
    const existingLink = await this.affiliateLink.findById(linkId);
    if (!existingLink) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && existingLink.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only activate your own affiliate links');
    }

    const activatedLink = await this.affiliateLink.activate(linkId);
    if (!activatedLink) {
      throw new Error('Failed to activate affiliate link');
    }

    return activatedLink;
  }

  async deactivateLink(linkId: string, creatorId?: string): Promise<AffiliateLinkData> {
    const existingLink = await this.affiliateLink.findById(linkId);
    if (!existingLink) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && existingLink.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only deactivate your own affiliate links');
    }

    const deactivatedLink = await this.affiliateLink.deactivate(linkId);
    if (!deactivatedLink) {
      throw new Error('Failed to deactivate affiliate link');
    }

    return deactivatedLink;
  }

  async deleteLink(linkId: string, creatorId?: string): Promise<void> {
    const existingLink = await this.affiliateLink.findById(linkId);
    if (!existingLink) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && existingLink.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only delete your own affiliate links');
    }

    // Soft delete to preserve statistics
    const deleted = await this.affiliateLink.delete(linkId);
    if (!deleted) {
      throw new Error('Failed to delete affiliate link');
    }
  }

  async regenerateTrackingCode(linkId: string, creatorId?: string): Promise<AffiliateLinkData> {
    const existingLink = await this.affiliateLink.findById(linkId);
    if (!existingLink) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && existingLink.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only regenerate tracking codes for your own affiliate links');
    }

    const updatedLink = await this.affiliateLink.regenerateTrackingCode(linkId);
    if (!updatedLink) {
      throw new Error('Failed to regenerate tracking code');
    }

    return updatedLink;
  }

  // Click Tracking
  async trackClick(request: TrackClickRequest): Promise<{ success: boolean; redirectUrl?: string; error?: string }> {
    try {
      // Find the affiliate link by tracking code
      const link = await this.affiliateLink.findByTrackingCode(request.trackingCode);
      if (!link) {
        return { success: false, error: 'Invalid tracking code' };
      }

      if (!link.is_active) {
        return { success: false, error: 'Link is inactive' };
      }

      // Record the click
      await this.affiliateLinkStats.trackClick(
        link.id!,
        request.articleId,
        request.ipAddress,
        request.userAgent,
        request.referrer
      );

      // Return the redirect URL
      const redirectUrl = request.redirectUrl || link.original_url;
      return { success: true, redirectUrl };

    } catch (error) {
      console.error('Error tracking affiliate click:', error);
      return { success: false, error: 'Failed to track click' };
    }
  }

  async recordConversion(conversionData: ConversionData): Promise<void> {
    // Find the affiliate link
    const link = await this.affiliateLink.findByTrackingCode(conversionData.trackingCode);
    if (!link) {
      throw new Error('Invalid tracking code');
    }

    // Find recent clicks for this tracking code that haven't been converted
    const recentClicks = await this.affiliateLinkStats.findMany({
      link_id: link.id!,
      converted: false,
      date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
    });

    if (recentClicks.stats.length === 0) {
      throw new Error('No recent clicks found for this tracking code');
    }

    // Mark the most recent click as converted
    const mostRecentClick = recentClicks.stats[0];
    await this.affiliateLinkStats.markConverted(
      mostRecentClick.id!,
      conversionData.commissionAmount
    );
  }

  async bulkRecordClicks(clicks: CreateAffiliateLinkStatsData[]): Promise<AffiliateLinkStatsData[]> {
    return this.affiliateLinkStats.bulkCreate(clicks);
  }

  // Analytics and Reporting
  async getLinkAnalytics(linkId: string, creatorId?: string, days = 30): Promise<LinkAnalytics> {
    // Verify access
    const link = await this.affiliateLink.findById(linkId);
    if (!link) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && link.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only view analytics for your own affiliate links');
    }

    // Get all analytics data
    const [performance, clickAnalytics, timeSeries, topArticles] = await Promise.all([
      this.affiliateLink.getPerformance(linkId, days),
      this.affiliateLinkStats.getAnalytics(linkId, days),
      this.affiliateLinkStats.getTimeSeriesData(linkId, days),
      this.affiliateLinkStats.getTopPerformingArticles(linkId, 10, days)
    ]);

    // Map topArticles to correct property names
    const mappedTopArticles = topArticles.map(article => ({
      articleId: article.article_id,
      articleTitle: article.article_title,
      clicks: article.clicks,
      conversions: article.conversions,
      conversionRate: article.conversion_rate,
      commission: article.commission
    }));

    return {
      link,
      performance: performance!,
      clickAnalytics,
      timeSeries,
      topArticles: mappedTopArticles
    };
  }

  async getCreatorSummary(creatorId: string, days = 30): Promise<CreatorAffiliateSummary> {
    // Get all links for creator
    const { links } = await this.affiliateLink.findMany({ creator_id: creatorId });

    // Get top performing links
    const topPerformingLinks = await this.affiliateLink.getTopPerformingLinks(creatorId, 10, days);

    // Calculate aggregated metrics
    const totalLinks = links.length;
    const activeLinks = links.filter(link => link.is_active).length;

    let totalClicks = 0;
    let totalConversions = 0;
    let totalCommission = 0;

    for (const link of links) {
      const performance = await this.affiliateLink.getPerformance(link.id!, days);
      if (performance) {
        totalClicks += performance.total_clicks;
        totalConversions += performance.conversions;
        totalCommission += performance.total_commission;
      }
    }

    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Get network breakdown
    const networkBreakdown = await this.getNetworkPerformance(creatorId, days);

    // Get monthly commission data
    const monthlyCommission = await this.getMonthlyCommissionBreakdown(creatorId, 12);

    return {
      totalLinks,
      activeLinks,
      totalClicks,
      totalConversions,
      totalCommission,
      conversionRate,
      topPerformingLinks,
      networkBreakdown,
      monthlyCommission
    };
  }

  async getNetworkPerformance(creatorId: string, days = 30): Promise<NetworkPerformance[]> {
    const query = `
      SELECT
        al.network,
        COUNT(al.id) as total_links,
        COUNT(als.id) as total_clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as total_conversions,
        COALESCE(SUM(CASE WHEN als.converted = true THEN als.commission_amount ELSE 0 END), 0) as total_commission
      FROM affiliate_links al
      LEFT JOIN affiliate_link_stats als ON al.id = als.link_id
        AND als.clicked_at > NOW() - INTERVAL '${days} days'
      WHERE al.creator_id = $1
      GROUP BY al.network
      ORDER BY total_commission DESC
    `;

    const result = await this.pool.query(query, [creatorId]);

    return result.rows.map(row => {
      const totalClicks = parseInt(row.total_clicks) || 0;
      const totalConversions = parseInt(row.total_conversions) || 0;
      const totalCommission = parseInt(row.total_commission) || 0;

      return {
        network: row.network,
        totalLinks: parseInt(row.total_links),
        totalClicks,
        totalConversions,
        totalCommission,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        averageCommissionPerConversion: totalConversions > 0 ? totalCommission / totalConversions : 0
      };
    });
  }

  async getMonthlyCommissionBreakdown(creatorId: string, months = 12): Promise<Array<{
    month: string;
    commission: number;
    clicks: number;
    conversions: number;
  }>> {
    const query = `
      SELECT
        TO_CHAR(als.clicked_at, 'YYYY-MM') as month,
        COALESCE(SUM(CASE WHEN als.converted = true THEN als.commission_amount ELSE 0 END), 0) as commission,
        COUNT(als.id) as clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as conversions
      FROM affiliate_link_stats als
      JOIN affiliate_links al ON als.link_id = al.id
      WHERE al.creator_id = $1
      AND als.clicked_at > NOW() - INTERVAL '${months} months'
      GROUP BY TO_CHAR(als.clicked_at, 'YYYY-MM')
      ORDER BY month ASC
    `;

    const result = await this.pool.query(query, [creatorId]);

    return result.rows.map(row => ({
      month: row.month,
      commission: parseInt(row.commission),
      clicks: parseInt(row.clicks),
      conversions: parseInt(row.conversions)
    }));
  }

  async getOptimizationSuggestions(linkId: string, creatorId?: string): Promise<LinkOptimizationSuggestions> {
    // Verify access
    const link = await this.affiliateLink.findById(linkId);
    if (!link) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && link.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only get suggestions for your own affiliate links');
    }

    // Get performance data
    const performance = await this.affiliateLink.getPerformance(linkId, 30);
    const clickAnalytics = await this.affiliateLinkStats.getAnalytics(linkId, 30);

    const suggestions: Array<{
      type: 'placement' | 'timing' | 'content' | 'network';
      description: string;
      potentialImpact: 'low' | 'medium' | 'high';
      actionRequired: string;
    }> = [];

    // Analyze performance and generate suggestions
    if (performance) {
      // Low click volume suggestion
      if (performance.total_clicks < 10) {
        suggestions.push({
          type: 'placement',
          description: 'Low click volume detected. Consider placing this link in more prominent positions.',
          potentialImpact: 'high',
          actionRequired: 'Review link placement in articles and consider adding to high-traffic content.'
        });
      }

      // Low conversion rate suggestion
      if (performance.conversion_rate < 2) {
        suggestions.push({
          type: 'content',
          description: 'Low conversion rate suggests poor product-content fit.',
          potentialImpact: 'high',
          actionRequired: 'Review if the linked product matches your content theme and audience interests.'
        });
      }

      // Network performance suggestion
      if (link.network === 'custom' && performance.conversion_rate < 1) {
        suggestions.push({
          type: 'network',
          description: 'Custom network showing poor performance.',
          potentialImpact: 'medium',
          actionRequired: 'Consider switching to established affiliate networks like Amazon Associates.'
        });
      }

      // Timing optimization
      if (clickAnalytics.top_sources.length > 0) {
        const topSource = clickAnalytics.top_sources[0];
        if (topSource.clicks > 50 && topSource.conversions === 0) {
          suggestions.push({
            type: 'timing',
            description: 'High clicks but no conversions from top-performing article.',
            potentialImpact: 'medium',
            actionRequired: 'Review the timing and context of the affiliate link in your top-performing content.'
          });
        }
      }
    }

    // Default suggestion if no specific issues found
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'content',
        description: 'Link appears to be performing within normal parameters.',
        potentialImpact: 'low',
        actionRequired: 'Continue monitoring performance and consider A/B testing different placements.'
      });
    }

    return {
      linkId,
      suggestions
    };
  }

  // Utilities and Helpers
  async getLinkByTrackingCode(trackingCode: string): Promise<AffiliateLinkData | null> {
    return this.affiliateLink.findByTrackingCode(trackingCode);
  }

  async buildTrackedUrl(linkId: string, baseUrl?: string): Promise<string | null> {
    const link = await this.affiliateLink.findById(linkId);
    if (!link) {
      return null;
    }

    const url = baseUrl || link.original_url;
    return this.affiliateLink.buildTrackedUrl(url, link.tracking_code!);
  }

  async getClickHistory(linkId: string, creatorId?: string, limit = 50): Promise<AffiliateLinkStatsData[]> {
    // Verify access
    const link = await this.affiliateLink.findById(linkId);
    if (!link) {
      throw new Error('Affiliate link not found');
    }

    if (creatorId && link.creator_id !== creatorId) {
      throw new Error('Unauthorized: You can only view click history for your own affiliate links');
    }

    const { stats } = await this.affiliateLinkStats.findMany({
      link_id: linkId,
      limit
    });

    return stats;
  }

  async exportAnalytics(creatorId: string, format: 'json' | 'csv' = 'json', days = 30): Promise<any> {
    const summary = await this.getCreatorSummary(creatorId, days);
    const { links } = await this.affiliateLink.findMany({ creator_id: creatorId });

    const analyticsData = {
      summary,
      links: await Promise.all(
        links.map(async (link) => {
          const analytics = await this.getLinkAnalytics(link.id!, creatorId, days);
          return analytics;
        })
      ),
      exportedAt: new Date().toISOString(),
      timeframe: `${days} days`
    };

    if (format === 'csv') {
      // Convert to CSV format
      return this.convertAnalyticsToCSV(analyticsData);
    }

    return analyticsData;
  }

  // Private Helper Methods
  private convertAnalyticsToCSV(data: any): string {
    const headers = [
      'Link Name',
      'Network',
      'Category',
      'Total Clicks',
      'Unique Clicks',
      'Conversions',
      'Conversion Rate',
      'Commission',
      'Status'
    ];

    const rows = data.links.map((linkAnalytics: any) => [
      linkAnalytics.link.name,
      linkAnalytics.link.network,
      linkAnalytics.link.category || '',
      linkAnalytics.performance.total_clicks,
      linkAnalytics.performance.unique_clicks,
      linkAnalytics.performance.conversions,
      `${linkAnalytics.performance.conversion_rate.toFixed(2)}%`,
      `$${(linkAnalytics.performance.total_commission / 100).toFixed(2)}`,
      linkAnalytics.link.is_active ? 'Active' : 'Inactive'
    ]);

    const csvContent = [headers, ...rows]
      .map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  }

  // Static utility methods
  static validateTrackingCode(trackingCode: string): boolean {
    // Tracking codes should be 16 character hex strings
    return /^[A-F0-9]{16}$/.test(trackingCode);
  }

  static extractProductInfo(url: string): { domain: string; productId?: string } {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Extract product ID for common affiliate networks
      let productId: string | undefined;

      if (domain.includes('amazon.')) {
        const match = url.match(/\/dp\/([A-Z0-9]{10})/);
        productId = match ? match[1] : undefined;
      } else if (domain.includes('shareasale.com')) {
        const params = new URLSearchParams(urlObj.search);
        productId = params.get('id') || undefined;
      }

      return { domain, productId };
    } catch {
      return { domain: 'unknown' };
    }
  }

  static generateShortCode(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static formatCommission(amountInCents: number, currency = 'USD'): string {
    const amount = amountInCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  }

  static calculateConversionRate(conversions: number, clicks: number): number {
    return clicks > 0 ? (conversions / clicks) * 100 : 0;
  }

  static getPerformanceLevel(conversionRate: number): 'poor' | 'average' | 'good' | 'excellent' {
    if (conversionRate >= 5) return 'excellent';
    if (conversionRate >= 3) return 'good';
    if (conversionRate >= 1) return 'average';
    return 'poor';
  }
}