import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface AdRevenueData {
  id?: string;
  creator_id: string;
  date: Date;
  source: 'adsense' | 'media_net' | 'direct';
  revenue: number; // in cents
  impressions?: number;
  clicks?: number;
  ctr?: number; // click-through rate percentage
  rpm?: number; // revenue per mille (per 1000 impressions)
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

export class AdRevenue {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(revenueData: CreateAdRevenueData): Promise<AdRevenueData> {
    const id = uuidv4();

    // Calculate CTR and RPM
    const ctr = this.calculateCTR(revenueData.clicks || 0, revenueData.impressions || 0);
    const rpm = this.calculateRPM(revenueData.revenue, revenueData.impressions || 0);

    const query = `
      INSERT INTO ad_revenue (
        id, creator_id, date, source, revenue, impressions, clicks, ctr, rpm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      id,
      revenueData.creator_id,
      revenueData.date,
      revenueData.source,
      revenueData.revenue,
      revenueData.impressions || 0,
      revenueData.clicks || 0,
      ctr,
      rpm
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<AdRevenueData | null> {
    const query = 'SELECT * FROM ad_revenue WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByCreatorAndDate(creatorId: string, date: Date, source?: string): Promise<AdRevenueData | null> {
    let query = 'SELECT * FROM ad_revenue WHERE creator_id = $1 AND DATE(date) = DATE($2)';
    const values: any[] = [creatorId, date];

    if (source) {
      query += ' AND source = $3';
      values.push(source);
    }

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async findByCreatorId(creatorId: string): Promise<AdRevenueData[]> {
    const query = `
      SELECT * FROM ad_revenue
      WHERE creator_id = $1
      ORDER BY date DESC
    `;
    const result = await this.pool.query(query, [creatorId]);
    return result.rows;
  }

  async findMany(filters: AdRevenueFilters = {}): Promise<{ revenue: AdRevenueData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    // Build WHERE clause dynamically
    if (filters.creator_id) {
      paramCount++;
      whereClause += ` AND creator_id = $${paramCount}`;
      values.push(filters.creator_id);
    }

    if (filters.source) {
      paramCount++;
      whereClause += ` AND source = $${paramCount}`;
      values.push(filters.source);
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
    const countQuery = `SELECT COUNT(*) FROM ad_revenue ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    let query = `SELECT * FROM ad_revenue ${whereClause} ORDER BY date DESC`;

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
    return { revenue: result.rows, total };
  }

  async update(id: string, updateData: UpdateAdRevenueData): Promise<AdRevenueData | null> {
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

    // Recalculate CTR and RPM if impressions or clicks are updated
    const current = await this.findById(id);
    if (current && (updateData.impressions !== undefined || updateData.clicks !== undefined)) {
      const newImpressions = updateData.impressions ?? current.impressions ?? 0;
      const newClicks = updateData.clicks ?? current.clicks ?? 0;
      const newRevenue = updateData.revenue ?? current.revenue;

      const ctr = this.calculateCTR(newClicks, newImpressions);
      const rpm = this.calculateRPM(newRevenue, newImpressions);

      fields.push(`ctr = $${paramCount}`, `rpm = $${paramCount + 1}`);
      values.push(ctr, rpm);
      paramCount += 2;
    }

    values.push(id);

    const query = `
      UPDATE ad_revenue
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async upsert(revenueData: CreateAdRevenueData): Promise<AdRevenueData> {
    const existing = await this.findByCreatorAndDate(
      revenueData.creator_id,
      revenueData.date,
      revenueData.source
    );

    if (existing) {
      // Update existing record
      const updateData: UpdateAdRevenueData = {
        revenue: revenueData.revenue,
        impressions: revenueData.impressions,
        clicks: revenueData.clicks
      };

      return (await this.update(existing.id!, updateData))!;
    } else {
      // Create new record
      return this.create(revenueData);
    }
  }

  async getMetrics(creatorId: string, days: number = 30): Promise<AdRevenueMetrics> {
    const query = `
      SELECT
        COALESCE(SUM(revenue), 0) as total_revenue,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(clicks), 0) as total_clicks,
        source,
        COALESCE(SUM(revenue), 0) as source_revenue
      FROM ad_revenue
      WHERE creator_id = $1
      AND date > NOW() - INTERVAL '${days} days'
      GROUP BY source
    `;

    const result = await this.pool.query(query, [creatorId]);

    let totalRevenue = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    const revenueBySource: Array<{ source: string; revenue: number; percentage: number }> = [];

    result.rows.forEach(row => {
      const revenue = parseInt(row.source_revenue);
      totalRevenue += revenue;
      totalImpressions += parseInt(row.total_impressions);
      totalClicks += parseInt(row.total_clicks);

      revenueBySource.push({
        source: row.source,
        revenue,
        percentage: 0 // Will be calculated after we have total
      });
    });

    // Calculate percentages
    revenueBySource.forEach(item => {
      item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
    });

    const avgCtr = this.calculateCTR(totalClicks, totalImpressions);
    const avgRpm = this.calculateRPM(totalRevenue, totalImpressions);

    return {
      total_revenue: totalRevenue,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      avg_ctr: avgCtr,
      avg_rpm: avgRpm,
      revenue_by_source: revenueBySource
    };
  }

  async getMonthlyBreakdown(creatorId: string, months: number = 12): Promise<MonthlyBreakdown[]> {
    const query = `
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        COALESCE(SUM(revenue), 0) as total,
        COALESCE(SUM(CASE WHEN source = 'adsense' THEN revenue ELSE 0 END), 0) as adsense,
        COALESCE(SUM(CASE WHEN source = 'media_net' THEN revenue ELSE 0 END), 0) as media_net,
        COALESCE(SUM(CASE WHEN source = 'direct' THEN revenue ELSE 0 END), 0) as direct
      FROM ad_revenue
      WHERE creator_id = $1
      AND date > NOW() - INTERVAL '${months} months'
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month ASC
    `;

    const result = await this.pool.query(query, [creatorId]);

    return result.rows.map(row => ({
      month: row.month,
      total: parseInt(row.total),
      adsense: parseInt(row.adsense),
      media_net: parseInt(row.media_net),
      direct: parseInt(row.direct)
    }));
  }

  async getDailyRevenue(creatorId: string, date: Date): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(revenue), 0) as daily_revenue
      FROM ad_revenue
      WHERE creator_id = $1 AND DATE(date) = DATE($2)
    `;

    const result = await this.pool.query(query, [creatorId, date]);
    return parseInt(result.rows[0].daily_revenue);
  }

  async getMonthlyRevenue(creatorId: string, year: number, month: number): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(revenue), 0) as monthly_revenue
      FROM ad_revenue
      WHERE creator_id = $1
      AND EXTRACT(YEAR FROM date) = $2
      AND EXTRACT(MONTH FROM date) = $3
    `;

    const result = await this.pool.query(query, [creatorId, year, month]);
    return parseInt(result.rows[0].monthly_revenue);
  }

  async getTopPerformingDays(creatorId: string, limit: number = 10, days: number = 30): Promise<Array<{
    date: string;
    revenue: number;
    impressions: number;
    clicks: number;
    ctr: number;
    rpm: number;
  }>> {
    const query = `
      SELECT
        DATE(date) as date,
        SUM(revenue) as revenue,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks
      FROM ad_revenue
      WHERE creator_id = $1
      AND date > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(date)
      ORDER BY revenue DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [creatorId, limit]);

    return result.rows.map(row => {
      const revenue = parseInt(row.revenue);
      const impressions = parseInt(row.impressions);
      const clicks = parseInt(row.clicks);

      return {
        date: row.date.toISOString().split('T')[0],
        revenue,
        impressions,
        clicks,
        ctr: this.calculateCTR(clicks, impressions),
        rpm: this.calculateRPM(revenue, impressions)
      };
    });
  }

  async getSourceComparison(creatorId: string, days: number = 30): Promise<Array<{
    source: string;
    revenue: number;
    impressions: number;
    clicks: number;
    ctr: number;
    rpm: number;
    growth_rate: number;
  }>> {
    const currentPeriodQuery = `
      SELECT
        source,
        SUM(revenue) as revenue,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks
      FROM ad_revenue
      WHERE creator_id = $1
      AND date > NOW() - INTERVAL '${days} days'
      GROUP BY source
    `;

    const previousPeriodQuery = `
      SELECT
        source,
        SUM(revenue) as revenue
      FROM ad_revenue
      WHERE creator_id = $1
      AND date BETWEEN NOW() - INTERVAL '${days * 2} days' AND NOW() - INTERVAL '${days} days'
      GROUP BY source
    `;

    const [currentResult, previousResult] = await Promise.all([
      this.pool.query(currentPeriodQuery, [creatorId]),
      this.pool.query(previousPeriodQuery, [creatorId])
    ]);

    const previousData = new Map(
      previousResult.rows.map(row => [row.source, parseInt(row.revenue)])
    );

    return currentResult.rows.map(row => {
      const revenue = parseInt(row.revenue);
      const impressions = parseInt(row.impressions);
      const clicks = parseInt(row.clicks);
      const previousRevenue = previousData.get(row.source) || 0;

      const growthRate = previousRevenue > 0
        ? ((revenue - previousRevenue) / previousRevenue) * 100
        : 0;

      return {
        source: row.source,
        revenue,
        impressions,
        clicks,
        ctr: this.calculateCTR(clicks, impressions),
        rpm: this.calculateRPM(revenue, impressions),
        growth_rate: growthRate
      };
    });
  }

  async addRevenue(creatorId: string, date: Date, source: 'adsense' | 'media_net' | 'direct', revenue: number, impressions?: number, clicks?: number): Promise<AdRevenueData> {
    return this.upsert({
      creator_id: creatorId,
      date,
      source,
      revenue,
      impressions,
      clicks
    });
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM ad_revenue WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCreatorId(creatorId: string): Promise<number> {
    const query = 'DELETE FROM ad_revenue WHERE creator_id = $1';
    const result = await this.pool.query(query, [creatorId]);
    return result.rowCount || 0;
  }

  async deleteOldRevenue(daysToKeep: number = 365): Promise<number> {
    const query = `
      DELETE FROM ad_revenue
      WHERE date < NOW() - INTERVAL '${daysToKeep} days'
    `;
    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  // Utility methods
  private calculateCTR(clicks: number, impressions: number): number {
    if (impressions === 0) return 0;
    return (clicks / impressions) * 100;
  }

  private calculateRPM(revenue: number, impressions: number): number {
    if (impressions === 0) return 0;
    return (revenue / impressions) * 1000;
  }

  // Validation methods
  static validateSource(source: string): boolean {
    return ['adsense', 'media_net', 'direct'].includes(source);
  }

  static validateRevenue(revenue: number): boolean {
    return revenue >= 0 && revenue <= 10000000; // Max $100,000 per day
  }

  static validateImpressions(impressions: number): boolean {
    return impressions >= 0 && impressions <= 10000000; // Max 10M impressions per day
  }

  static validateClicks(clicks: number): boolean {
    return clicks >= 0 && clicks <= 1000000; // Max 1M clicks per day
  }

  static formatRevenue(revenueInCents: number, currency: string = 'USD'): string {
    const amount = revenueInCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  static formatCTR(ctr: number): string {
    return `${Math.round(ctr * 100) / 100}%`;
  }

  static formatRPM(rpm: number, currency: string = 'USD'): string {
    const amount = rpm / 100;
    return `${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount)}`;
  }

  static isHighPerformance(ctr: number, rpm: number): boolean {
    return ctr > 2.0 && rpm > 500; // CTR > 2% and RPM > $5
  }

  static getRevenueGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }
}