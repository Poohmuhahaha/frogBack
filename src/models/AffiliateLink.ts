import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface AffiliateLinkData {
  id?: string;
  creator_id: string;
  name: string;
  original_url: string;
  tracking_code?: string;
  network: 'amazon' | 'shareasale' | 'cj' | 'custom';
  commission_rate?: number;
  category?: string;
  is_active?: boolean;
  created_at?: Date;
}

export interface CreateAffiliateLinkData {
  creator_id: string;
  name: string;
  original_url: string;
  network: 'amazon' | 'shareasale' | 'cj' | 'custom';
  commission_rate?: number;
  category?: string;
}

export interface UpdateAffiliateLinkData {
  name?: string;
  original_url?: string;
  commission_rate?: number;
  category?: string;
  is_active?: boolean;
}

export interface AffiliateLinkFilters {
  creator_id?: string;
  network?: 'amazon' | 'shareasale' | 'cj' | 'custom';
  category?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AffiliateLinkPerformance {
  link_id: string;
  link_name: string;
  total_clicks: number;
  unique_clicks: number;
  conversions: number;
  conversion_rate: number;
  total_commission: number;
  avg_commission_per_conversion: number;
}

export class AffiliateLink {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(linkData: CreateAffiliateLinkData): Promise<AffiliateLinkData> {
    const id = uuidv4();
    const trackingCode = this.generateTrackingCode();
    const now = new Date();

    const query = `
      INSERT INTO affiliate_links (
        id, creator_id, name, original_url, tracking_code, network,
        commission_rate, category, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      id,
      linkData.creator_id,
      linkData.name,
      linkData.original_url,
      trackingCode,
      linkData.network,
      linkData.commission_rate || 0,
      linkData.category || null,
      true, // Default to active
      now
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<AffiliateLinkData | null> {
    const query = 'SELECT * FROM affiliate_links WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByTrackingCode(trackingCode: string): Promise<AffiliateLinkData | null> {
    const query = 'SELECT * FROM affiliate_links WHERE tracking_code = $1';
    const result = await this.pool.query(query, [trackingCode]);
    return result.rows[0] || null;
  }

  async findByCreatorId(creatorId: string): Promise<AffiliateLinkData[]> {
    const query = `
      SELECT * FROM affiliate_links
      WHERE creator_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [creatorId]);
    return result.rows;
  }

  async findMany(filters: AffiliateLinkFilters = {}): Promise<{ links: AffiliateLinkData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    // Build WHERE clause dynamically
    if (filters.creator_id) {
      paramCount++;
      whereClause += ` AND creator_id = $${paramCount}`;
      values.push(filters.creator_id);
    }

    if (filters.network) {
      paramCount++;
      whereClause += ` AND network = $${paramCount}`;
      values.push(filters.network);
    }

    if (filters.category) {
      paramCount++;
      whereClause += ` AND category = $${paramCount}`;
      values.push(filters.category);
    }

    if (filters.is_active !== undefined) {
      paramCount++;
      whereClause += ` AND is_active = $${paramCount}`;
      values.push(filters.is_active);
    }

    if (filters.search) {
      paramCount++;
      whereClause += ` AND (name ILIKE $${paramCount} OR original_url ILIKE $${paramCount} OR category ILIKE $${paramCount})`;
      values.push(`%${filters.search}%`);
    }

    // Count total results
    const countQuery = `SELECT COUNT(*) FROM affiliate_links ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    let query = `SELECT * FROM affiliate_links ${whereClause} ORDER BY created_at DESC`;

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
    return { links: result.rows, total };
  }

  async findActive(): Promise<AffiliateLinkData[]> {
    const query = `
      SELECT * FROM affiliate_links
      WHERE is_active = true
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query);
    return result.rows;
  }

  async update(id: string, updateData: UpdateAffiliateLinkData): Promise<AffiliateLinkData | null> {
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
      UPDATE affiliate_links
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async activate(id: string): Promise<AffiliateLinkData | null> {
    return this.update(id, { is_active: true });
  }

  async deactivate(id: string): Promise<AffiliateLinkData | null> {
    return this.update(id, { is_active: false });
  }

  async getPerformance(linkId: string, days: number = 30): Promise<AffiliateLinkPerformance | null> {
    const query = `
      SELECT
        al.id as link_id,
        al.name as link_name,
        COUNT(als.id) as total_clicks,
        COUNT(DISTINCT als.ip_address) as unique_clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as conversions,
        COALESCE(SUM(CASE WHEN als.converted = true THEN als.commission_amount ELSE 0 END), 0) as total_commission
      FROM affiliate_links al
      LEFT JOIN affiliate_link_stats als ON al.id = als.link_id
        AND als.clicked_at > NOW() - INTERVAL '${days} days'
      WHERE al.id = $1
      GROUP BY al.id, al.name
    `;

    const result = await this.pool.query(query, [linkId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const totalClicks = parseInt(row.total_clicks) || 0;
    const uniqueClicks = parseInt(row.unique_clicks) || 0;
    const conversions = parseInt(row.conversions) || 0;
    const totalCommission = parseInt(row.total_commission) || 0;

    return {
      link_id: row.link_id,
      link_name: row.link_name,
      total_clicks: totalClicks,
      unique_clicks: uniqueClicks,
      conversions,
      conversion_rate: totalClicks > 0 ? (conversions / totalClicks) * 100 : 0,
      total_commission: totalCommission,
      avg_commission_per_conversion: conversions > 0 ? totalCommission / conversions : 0
    };
  }

  async getTopPerformingLinks(creatorId: string, limit: number = 10, days: number = 30): Promise<AffiliateLinkPerformance[]> {
    const query = `
      SELECT
        al.id as link_id,
        al.name as link_name,
        COUNT(als.id) as total_clicks,
        COUNT(DISTINCT als.ip_address) as unique_clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as conversions,
        COALESCE(SUM(CASE WHEN als.converted = true THEN als.commission_amount ELSE 0 END), 0) as total_commission
      FROM affiliate_links al
      LEFT JOIN affiliate_link_stats als ON al.id = als.link_id
        AND als.clicked_at > NOW() - INTERVAL '${days} days'
      WHERE al.creator_id = $1 AND al.is_active = true
      GROUP BY al.id, al.name
      ORDER BY total_clicks DESC, total_commission DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [creatorId, limit]);

    return result.rows.map(row => {
      const totalClicks = parseInt(row.total_clicks) || 0;
      const uniqueClicks = parseInt(row.unique_clicks) || 0;
      const conversions = parseInt(row.conversions) || 0;
      const totalCommission = parseInt(row.total_commission) || 0;

      return {
        link_id: row.link_id,
        link_name: row.link_name,
        total_clicks: totalClicks,
        unique_clicks: uniqueClicks,
        conversions,
        conversion_rate: totalClicks > 0 ? (conversions / totalClicks) * 100 : 0,
        total_commission: totalCommission,
        avg_commission_per_conversion: conversions > 0 ? totalCommission / conversions : 0
      };
    });
  }

  async getTotalCommission(creatorId: string, days: number = 30): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(als.commission_amount), 0) as total_commission
      FROM affiliate_links al
      JOIN affiliate_link_stats als ON al.id = als.link_id
      WHERE al.creator_id = $1
      AND als.converted = true
      AND als.conversion_date > NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query, [creatorId]);
    return parseInt(result.rows[0].total_commission) || 0;
  }

  async getClickCount(linkId: string, days: number = 30): Promise<number> {
    const query = `
      SELECT COUNT(*) as click_count
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query, [linkId]);
    return parseInt(result.rows[0].click_count) || 0;
  }

  async getUniqueClickCount(linkId: string, days: number = 30): Promise<number> {
    const query = `
      SELECT COUNT(DISTINCT ip_address) as unique_clicks
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query, [linkId]);
    return parseInt(result.rows[0].unique_clicks) || 0;
  }

  async regenerateTrackingCode(id: string): Promise<AffiliateLinkData | null> {
    const newTrackingCode = this.generateTrackingCode();
    return this.update(id, { tracking_code: newTrackingCode } as any);
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete by deactivating to preserve click statistics
    const result = await this.update(id, { is_active: false });
    return result !== null;
  }

  async hardDelete(id: string): Promise<boolean> {
    // Only allow hard delete if no click stats exist
    const statsCheck = await this.pool.query(
      'SELECT 1 FROM affiliate_link_stats WHERE link_id = $1 LIMIT 1',
      [id]
    );

    if (statsCheck.rows.length > 0) {
      throw new Error('Cannot delete affiliate link with existing click statistics');
    }

    const query = 'DELETE FROM affiliate_links WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Utility methods
  private generateTrackingCode(): string {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  buildTrackedUrl(baseUrl: string, trackingCode: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}ref=${trackingCode}`;
  }

  // Validation methods
  static validateName(name: string): boolean {
    return name.length > 0 && name.length <= 200;
  }

  static validateUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  static validateNetwork(network: string): boolean {
    return ['amazon', 'shareasale', 'cj', 'custom'].includes(network);
  }

  static validateCommissionRate(rate: number): boolean {
    return rate >= 0 && rate <= 100;
  }

  static validateCategory(category: string): boolean {
    return category.length <= 100;
  }

  static extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  static isTrackingCodeUnique(trackingCode: string, existingCodes: string[]): boolean {
    return !existingCodes.includes(trackingCode);
  }
}