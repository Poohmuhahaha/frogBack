import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface ArticleAnalyticsData {
  id?: string;
  article_id: string;
  date: Date;
  page_views?: number;
  unique_visitors?: number;
  avg_time_on_page?: number; // in seconds
  bounce_rate?: number; // percentage 0-100
  social_shares?: number;
  ad_revenue?: number; // in cents
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
  performance_score: number; // 0-100 composite score
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

export class ArticleAnalytics {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(analyticsData: CreateArticleAnalyticsData): Promise<ArticleAnalyticsData> {
    const id = uuidv4();

    const query = `
      INSERT INTO article_analytics (
        id, article_id, date, page_views, unique_visitors, avg_time_on_page,
        bounce_rate, social_shares, ad_revenue, affiliate_clicks, newsletter_signups
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      analyticsData.article_id,
      analyticsData.date,
      analyticsData.page_views || 0,
      analyticsData.unique_visitors || 0,
      analyticsData.avg_time_on_page || 0,
      analyticsData.bounce_rate || 0,
      analyticsData.social_shares || 0,
      analyticsData.ad_revenue || 0,
      analyticsData.affiliate_clicks || 0,
      analyticsData.newsletter_signups || 0
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ArticleAnalyticsData | null> {
    const query = 'SELECT * FROM article_analytics WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByArticleAndDate(articleId: string, date: Date): Promise<ArticleAnalyticsData | null> {
    const query = `
      SELECT * FROM article_analytics
      WHERE article_id = $1 AND DATE(date) = DATE($2)
    `;
    const result = await this.pool.query(query, [articleId, date]);
    return result.rows[0] || null;
  }

  async findByArticleId(articleId: string): Promise<ArticleAnalyticsData[]> {
    const query = `
      SELECT * FROM article_analytics
      WHERE article_id = $1
      ORDER BY date DESC
    `;
    const result = await this.pool.query(query, [articleId]);
    return result.rows;
  }

  async findMany(filters: ArticleAnalyticsFilters = {}): Promise<{ analytics: ArticleAnalyticsData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    // Build WHERE clause dynamically
    if (filters.article_id) {
      paramCount++;
      whereClause += ` AND article_id = $${paramCount}`;
      values.push(filters.article_id);
    }

    if (filters.date_from) {
      paramCount++;
      whereClause += ` AND date >= $${paramCount}`;
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      whereClause += ` AND date <= $${paramCount}`;
      values.push(filters.date_to);
    }

    // Count total results
    const countQuery = `SELECT COUNT(*) FROM article_analytics ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    let query = `SELECT * FROM article_analytics ${whereClause} ORDER BY date DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await this.pool.query(query, values);
    return { analytics: result.rows, total };
  }

  async update(id: string, updateData: UpdateArticleAnalyticsData): Promise<ArticleAnalyticsData | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const query = `
      UPDATE article_analytics
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async upsert(analyticsData: CreateArticleAnalyticsData): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(analyticsData.article_id, analyticsData.date);

    if (existing) {
      // Update existing record
      const updateData: UpdateArticleAnalyticsData = { ...analyticsData };
      delete (updateData as any).article_id;
      delete (updateData as any).date;

      return (await this.update(existing.id!, updateData))!;
    } else {
      // Create new record
      return this.create(analyticsData);
    }
  }

  async incrementPageView(articleId: string, date: Date): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        page_views: (existing.page_views || 0) + 1
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        page_views: 1
      });
    }
  }

  async incrementUniqueVisitor(articleId: string, date: Date): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        unique_visitors: (existing.unique_visitors || 0) + 1
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        unique_visitors: 1
      });
    }
  }

  async incrementSocialShare(articleId: string, date: Date): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        social_shares: (existing.social_shares || 0) + 1
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        social_shares: 1
      });
    }
  }

  async incrementAffiliateClick(articleId: string, date: Date): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        affiliate_clicks: (existing.affiliate_clicks || 0) + 1
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        affiliate_clicks: 1
      });
    }
  }

  async incrementNewsletterSignup(articleId: string, date: Date): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        newsletter_signups: (existing.newsletter_signups || 0) + 1
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        newsletter_signups: 1
      });
    }
  }

  async addRevenue(articleId: string, date: Date, revenueInCents: number): Promise<ArticleAnalyticsData> {
    const existing = await this.findByArticleAndDate(articleId, date);

    if (existing) {
      return (await this.update(existing.id!, {
        ad_revenue: (existing.ad_revenue || 0) + revenueInCents
      }))!;
    } else {
      return this.create({
        article_id: articleId,
        date,
        ad_revenue: revenueInCents
      });
    }
  }

  async getPerformanceSummary(articleId: string, days: number = 30): Promise<ArticlePerformanceSummary | null> {
    const query = `
      SELECT
        aa.article_id,
        a.title as article_title,
        COALESCE(SUM(aa.page_views), 0) as total_page_views,
        COALESCE(SUM(aa.unique_visitors), 0) as total_unique_visitors,
        COALESCE(AVG(aa.avg_time_on_page), 0) as avg_time_on_page,
        COALESCE(AVG(aa.bounce_rate), 0) as avg_bounce_rate,
        COALESCE(SUM(aa.social_shares), 0) as total_social_shares,
        COALESCE(SUM(aa.ad_revenue), 0) as total_ad_revenue,
        COALESCE(SUM(aa.affiliate_clicks), 0) as total_affiliate_clicks,
        COALESCE(SUM(aa.newsletter_signups), 0) as total_newsletter_signups
      FROM article_analytics aa
      JOIN articles a ON aa.article_id = a.id
      WHERE aa.article_id = $1
      AND aa.date > NOW() - INTERVAL '${days} days'
      GROUP BY aa.article_id, a.title
    `;

    const result = await this.pool.query(query, [articleId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Calculate performance score (0-100)
    const pageViews = parseInt(row.total_page_views);
    const uniqueVisitors = parseInt(row.total_unique_visitors);
    const avgTimeOnPage = parseFloat(row.avg_time_on_page);
    const bounceRate = parseFloat(row.avg_bounce_rate);
    const socialShares = parseInt(row.total_social_shares);
    const adRevenue = parseInt(row.total_ad_revenue);
    const affiliateClicks = parseInt(row.total_affiliate_clicks);
    const newsletterSignups = parseInt(row.total_newsletter_signups);

    const performanceScore = this.calculatePerformanceScore({
      pageViews,
      uniqueVisitors,
      avgTimeOnPage,
      bounceRate,
      socialShares,
      adRevenue,
      affiliateClicks,
      newsletterSignups
    });

    return {
      article_id: row.article_id,
      article_title: row.article_title,
      total_page_views: pageViews,
      total_unique_visitors: uniqueVisitors,
      avg_time_on_page: avgTimeOnPage,
      avg_bounce_rate: bounceRate,
      total_social_shares: socialShares,
      total_ad_revenue: adRevenue,
      total_affiliate_clicks: affiliateClicks,
      total_newsletter_signups: newsletterSignups,
      performance_score: performanceScore
    };
  }

  async getTimeSeriesData(articleId: string, days: number = 30): Promise<TimeSeriesAnalytics[]> {
    const query = `
      SELECT
        DATE(date) as date,
        COALESCE(SUM(page_views), 0) as page_views,
        COALESCE(SUM(unique_visitors), 0) as unique_visitors,
        COALESCE(AVG(avg_time_on_page), 0) as avg_time_on_page,
        COALESCE(AVG(bounce_rate), 0) as bounce_rate,
        COALESCE(SUM(social_shares), 0) as social_shares,
        COALESCE(SUM(ad_revenue), 0) as ad_revenue,
        COALESCE(SUM(affiliate_clicks), 0) as affiliate_clicks,
        COALESCE(SUM(newsletter_signups), 0) as newsletter_signups
      FROM article_analytics
      WHERE article_id = $1
      AND date > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(date)
      ORDER BY date ASC
    `;

    const result = await this.pool.query(query, [articleId]);

    return result.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      page_views: parseInt(row.page_views),
      unique_visitors: parseInt(row.unique_visitors),
      avg_time_on_page: parseFloat(row.avg_time_on_page),
      bounce_rate: parseFloat(row.bounce_rate),
      social_shares: parseInt(row.social_shares),
      ad_revenue: parseInt(row.ad_revenue),
      affiliate_clicks: parseInt(row.affiliate_clicks),
      newsletter_signups: parseInt(row.newsletter_signups)
    }));
  }

  async getTopPerformingArticles(creatorId: string, limit: number = 10, days: number = 30): Promise<ArticlePerformanceSummary[]> {
    const query = `
      SELECT
        aa.article_id,
        a.title as article_title,
        COALESCE(SUM(aa.page_views), 0) as total_page_views,
        COALESCE(SUM(aa.unique_visitors), 0) as total_unique_visitors,
        COALESCE(AVG(aa.avg_time_on_page), 0) as avg_time_on_page,
        COALESCE(AVG(aa.bounce_rate), 0) as avg_bounce_rate,
        COALESCE(SUM(aa.social_shares), 0) as total_social_shares,
        COALESCE(SUM(aa.ad_revenue), 0) as total_ad_revenue,
        COALESCE(SUM(aa.affiliate_clicks), 0) as total_affiliate_clicks,
        COALESCE(SUM(aa.newsletter_signups), 0) as total_newsletter_signups
      FROM article_analytics aa
      JOIN articles a ON aa.article_id = a.id
      WHERE a.author_id = $1
      AND aa.date > NOW() - INTERVAL '${days} days'
      GROUP BY aa.article_id, a.title
      ORDER BY total_page_views DESC, total_ad_revenue DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [creatorId, limit]);

    return result.rows.map(row => {
      const pageViews = parseInt(row.total_page_views);
      const uniqueVisitors = parseInt(row.total_unique_visitors);
      const avgTimeOnPage = parseFloat(row.avg_time_on_page);
      const bounceRate = parseFloat(row.avg_bounce_rate);
      const socialShares = parseInt(row.total_social_shares);
      const adRevenue = parseInt(row.total_ad_revenue);
      const affiliateClicks = parseInt(row.total_affiliate_clicks);
      const newsletterSignups = parseInt(row.total_newsletter_signups);

      const performanceScore = this.calculatePerformanceScore({
        pageViews,
        uniqueVisitors,
        avgTimeOnPage,
        bounceRate,
        socialShares,
        adRevenue,
        affiliateClicks,
        newsletterSignups
      });

      return {
        article_id: row.article_id,
        article_title: row.article_title,
        total_page_views: pageViews,
        total_unique_visitors: uniqueVisitors,
        avg_time_on_page: avgTimeOnPage,
        avg_bounce_rate: bounceRate,
        total_social_shares: socialShares,
        total_ad_revenue: adRevenue,
        total_affiliate_clicks: affiliateClicks,
        total_newsletter_signups: newsletterSignups,
        performance_score: performanceScore
      };
    });
  }

  async getAggregatedMetrics(creatorId: string, days: number = 30): Promise<{
    total_page_views: number;
    total_unique_visitors: number;
    avg_time_on_page: number;
    avg_bounce_rate: number;
    total_social_shares: number;
    total_ad_revenue: number;
    total_affiliate_clicks: number;
    total_newsletter_signups: number;
  }> {
    const query = `
      SELECT
        COALESCE(SUM(aa.page_views), 0) as total_page_views,
        COALESCE(SUM(aa.unique_visitors), 0) as total_unique_visitors,
        COALESCE(AVG(aa.avg_time_on_page), 0) as avg_time_on_page,
        COALESCE(AVG(aa.bounce_rate), 0) as avg_bounce_rate,
        COALESCE(SUM(aa.social_shares), 0) as total_social_shares,
        COALESCE(SUM(aa.ad_revenue), 0) as total_ad_revenue,
        COALESCE(SUM(aa.affiliate_clicks), 0) as total_affiliate_clicks,
        COALESCE(SUM(aa.newsletter_signups), 0) as total_newsletter_signups
      FROM article_analytics aa
      JOIN articles a ON aa.article_id = a.id
      WHERE a.author_id = $1
      AND aa.date > NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query, [creatorId]);
    const row = result.rows[0];

    return {
      total_page_views: parseInt(row.total_page_views),
      total_unique_visitors: parseInt(row.total_unique_visitors),
      avg_time_on_page: parseFloat(row.avg_time_on_page),
      avg_bounce_rate: parseFloat(row.avg_bounce_rate),
      total_social_shares: parseInt(row.total_social_shares),
      total_ad_revenue: parseInt(row.total_ad_revenue),
      total_affiliate_clicks: parseInt(row.total_affiliate_clicks),
      total_newsletter_signups: parseInt(row.total_newsletter_signups)
    };
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM article_analytics WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByArticleId(articleId: string): Promise<number> {
    const query = 'DELETE FROM article_analytics WHERE article_id = $1';
    const result = await this.pool.query(query, [articleId]);
    return result.rowCount || 0;
  }

  async deleteOldAnalytics(daysToKeep: number = 365): Promise<number> {
    const query = `
      DELETE FROM article_analytics
      WHERE date < NOW() - INTERVAL '${daysToKeep} days'
    `;
    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  // Utility methods
  private calculatePerformanceScore(metrics: {
    pageViews: number;
    uniqueVisitors: number;
    avgTimeOnPage: number;
    bounceRate: number;
    socialShares: number;
    adRevenue: number;
    affiliateClicks: number;
    newsletterSignups: number;
  }): number {
    // Weighted scoring system (0-100)
    let score = 0;

    // Page views (25% weight)
    score += Math.min((metrics.pageViews / 1000) * 25, 25);

    // Engagement (25% weight)
    const engagementScore = (metrics.avgTimeOnPage / 300) * 12.5 + // 300s = high engagement
                           ((100 - metrics.bounceRate) / 100) * 12.5;
    score += Math.min(engagementScore, 25);

    // Social engagement (20% weight)
    score += Math.min((metrics.socialShares / 50) * 20, 20);

    // Monetization (20% weight)
    const monetizationScore = (metrics.adRevenue / 10000) * 10 + // $100 = good revenue
                              (metrics.affiliateClicks / 100) * 10;
    score += Math.min(monetizationScore, 20);

    // Conversion (10% weight)
    score += Math.min((metrics.newsletterSignups / 20) * 10, 10);

    return Math.round(Math.min(score, 100));
  }

  static formatTimeOnPage(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    }
  }

  static formatBounceRate(rate: number): string {
    return `${Math.round(rate * 100) / 100}%`;
  }

  static isHighPerformance(score: number): boolean {
    return score >= 75;
  }

  static getPerformanceLevel(score: number): 'excellent' | 'good' | 'average' | 'poor' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  }
}