import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface EmailCampaignStatsData {
  id?: string;
  campaign_id: string;
  subscriber_id: string;
  delivered_at?: Date;
  opened_at?: Date;
  clicked_at?: Date;
  unsubscribed_at?: Date;
}

export interface CreateEmailCampaignStatsData {
  campaign_id: string;
  subscriber_id: string;
  delivered_at?: Date;
}

export interface UpdateEmailCampaignStatsData {
  delivered_at?: Date;
  opened_at?: Date;
  clicked_at?: Date;
  unsubscribed_at?: Date;
}

export interface EmailCampaignStatsFilters {
  campaign_id?: string;
  subscriber_id?: string;
  delivered?: boolean;
  opened?: boolean;
  clicked?: boolean;
  unsubscribed?: boolean;
  limit?: number;
  offset?: number;
}

export interface CampaignPerformanceMetrics {
  campaign_id: string;
  campaign_name: string;
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
}

export class EmailCampaignStats {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(statsData: CreateEmailCampaignStatsData): Promise<EmailCampaignStatsData> {
    const id = uuidv4();

    const query = `
      INSERT INTO email_campaign_stats (
        id, campaign_id, subscriber_id, delivered_at
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [
      id,
      statsData.campaign_id,
      statsData.subscriber_id,
      statsData.delivered_at || new Date()
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<EmailCampaignStatsData | null> {
    const query = 'SELECT * FROM email_campaign_stats WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByCampaignAndSubscriber(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null> {
    const query = `
      SELECT * FROM email_campaign_stats
      WHERE campaign_id = $1 AND subscriber_id = $2
    `;
    const result = await this.pool.query(query, [campaignId, subscriberId]);
    return result.rows[0] || null;
  }

  async findByCampaignId(campaignId: string): Promise<EmailCampaignStatsData[]> {
    const query = `
      SELECT * FROM email_campaign_stats
      WHERE campaign_id = $1
      ORDER BY delivered_at DESC
    `;
    const result = await this.pool.query(query, [campaignId]);
    return result.rows;
  }

  async findBySubscriberId(subscriberId: string): Promise<EmailCampaignStatsData[]> {
    const query = `
      SELECT * FROM email_campaign_stats
      WHERE subscriber_id = $1
      ORDER BY delivered_at DESC
    `;
    const result = await this.pool.query(query, [subscriberId]);
    return result.rows;
  }

  async findMany(filters: EmailCampaignStatsFilters = {}): Promise<{ stats: EmailCampaignStatsData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    // Build WHERE clause dynamically
    if (filters.campaign_id) {
      paramCount++;
      whereClause += ` AND campaign_id = $${paramCount}`;
      values.push(filters.campaign_id);
    }

    if (filters.subscriber_id) {
      paramCount++;
      whereClause += ` AND subscriber_id = $${paramCount}`;
      values.push(filters.subscriber_id);
    }

    if (filters.delivered !== undefined) {
      whereClause += filters.delivered
        ? ' AND delivered_at IS NOT NULL'
        : ' AND delivered_at IS NULL';
    }

    if (filters.opened !== undefined) {
      whereClause += filters.opened
        ? ' AND opened_at IS NOT NULL'
        : ' AND opened_at IS NULL';
    }

    if (filters.clicked !== undefined) {
      whereClause += filters.clicked
        ? ' AND clicked_at IS NOT NULL'
        : ' AND clicked_at IS NULL';
    }

    if (filters.unsubscribed !== undefined) {
      whereClause += filters.unsubscribed
        ? ' AND unsubscribed_at IS NOT NULL'
        : ' AND unsubscribed_at IS NULL';
    }

    // Count total results
    const countQuery = `SELECT COUNT(*) FROM email_campaign_stats ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    let query = `SELECT * FROM email_campaign_stats ${whereClause} ORDER BY delivered_at DESC`;

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
    return { stats: result.rows, total };
  }

  async update(id: string, updateData: UpdateEmailCampaignStatsData): Promise<EmailCampaignStatsData | null> {
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
      UPDATE email_campaign_stats
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async markDelivered(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null> {
    const existing = await this.findByCampaignAndSubscriber(campaignId, subscriberId);

    if (existing) {
      return this.update(existing.id!, { delivered_at: new Date() });
    } else {
      return this.create({ campaign_id: campaignId, subscriber_id: subscriberId });
    }
  }

  async markOpened(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null> {
    const existing = await this.findByCampaignAndSubscriber(campaignId, subscriberId);

    if (existing) {
      // Only update if not already opened (first open tracking)
      if (!existing.opened_at) {
        return this.update(existing.id!, { opened_at: new Date() });
      }
      return existing;
    }

    // Create new record with both delivered and opened timestamps
    const now = new Date();
    return this.create({
      campaign_id: campaignId,
      subscriber_id: subscriberId,
      delivered_at: now
    }).then(created => {
      return this.update(created.id!, { opened_at: now });
    });
  }

  async markClicked(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null> {
    const existing = await this.findByCampaignAndSubscriber(campaignId, subscriberId);

    if (existing) {
      // Only update if not already clicked (first click tracking)
      if (!existing.clicked_at) {
        const updateData: UpdateEmailCampaignStatsData = { clicked_at: new Date() };

        // Also mark as opened if not already opened
        if (!existing.opened_at) {
          updateData.opened_at = new Date();
        }

        return this.update(existing.id!, updateData);
      }
      return existing;
    }

    // Create new record with delivered, opened, and clicked timestamps
    const now = new Date();
    return this.create({
      campaign_id: campaignId,
      subscriber_id: subscriberId,
      delivered_at: now
    }).then(created => {
      return this.update(created.id!, {
        opened_at: now,
        clicked_at: now
      });
    });
  }

  async markUnsubscribed(campaignId: string, subscriberId: string): Promise<EmailCampaignStatsData | null> {
    const existing = await this.findByCampaignAndSubscriber(campaignId, subscriberId);

    if (existing) {
      return this.update(existing.id!, { unsubscribed_at: new Date() });
    }

    // Create new record if it doesn't exist
    return this.create({
      campaign_id: campaignId,
      subscriber_id: subscriberId
    }).then(created => {
      return this.update(created.id!, { unsubscribed_at: new Date() });
    });
  }

  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformanceMetrics | null> {
    const query = `
      SELECT
        ec.id as campaign_id,
        ec.name as campaign_name,
        ec.recipient_count as total_sent,
        COUNT(ecs.id) as delivered,
        COUNT(CASE WHEN ecs.opened_at IS NOT NULL THEN 1 END) as opened,
        COUNT(CASE WHEN ecs.clicked_at IS NOT NULL THEN 1 END) as clicked,
        COUNT(CASE WHEN ecs.unsubscribed_at IS NOT NULL THEN 1 END) as unsubscribed
      FROM email_campaigns ec
      LEFT JOIN email_campaign_stats ecs ON ec.id = ecs.campaign_id
      WHERE ec.id = $1
      GROUP BY ec.id, ec.name, ec.recipient_count
    `;

    const result = await this.pool.query(query, [campaignId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const totalSent = parseInt(row.total_sent) || 0;
    const delivered = parseInt(row.delivered) || 0;
    const opened = parseInt(row.opened) || 0;
    const clicked = parseInt(row.clicked) || 0;
    const unsubscribed = parseInt(row.unsubscribed) || 0;

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      total_sent: totalSent,
      delivered,
      opened,
      clicked,
      unsubscribed,
      delivery_rate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
      open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
      click_rate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      unsubscribe_rate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0
    };
  }

  async getSubscriberEngagement(subscriberId: string, days: number = 30): Promise<{
    total_emails: number;
    delivered: number;
    opened: number;
    clicked: number;
    engagement_score: number;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_emails,
        COUNT(CASE WHEN delivered_at IS NOT NULL THEN 1 END) as delivered,
        COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked
      FROM email_campaign_stats
      WHERE subscriber_id = $1
      AND delivered_at > NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query, [subscriberId]);
    const stats = result.rows[0];

    const totalEmails = parseInt(stats.total_emails) || 0;
    const delivered = parseInt(stats.delivered) || 0;
    const opened = parseInt(stats.opened) || 0;
    const clicked = parseInt(stats.clicked) || 0;

    let engagementScore = 0;
    if (delivered > 0) {
      const openRate = opened / delivered;
      const clickRate = clicked / delivered;
      // Weighted scoring: opens = 40%, clicks = 60%
      engagementScore = Math.round((openRate * 40) + (clickRate * 60));
    }

    return {
      total_emails: totalEmails,
      delivered,
      opened,
      clicked,
      engagement_score: engagementScore
    };
  }

  async bulkCreate(statsDataArray: CreateEmailCampaignStatsData[]): Promise<EmailCampaignStatsData[]> {
    if (statsDataArray.length === 0) return [];

    const values: any[] = [];
    const placeholders: string[] = [];

    statsDataArray.forEach((statsData, index) => {
      const id = uuidv4();
      const offset = index * 4;

      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      values.push(
        id,
        statsData.campaign_id,
        statsData.subscriber_id,
        statsData.delivered_at || new Date()
      );
    });

    const query = `
      INSERT INTO email_campaign_stats (id, campaign_id, subscriber_id, delivered_at)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM email_campaign_stats WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaign(campaignId: string): Promise<number> {
    const query = 'DELETE FROM email_campaign_stats WHERE campaign_id = $1';
    const result = await this.pool.query(query, [campaignId]);
    return result.rowCount || 0;
  }

  // Utility methods
  static calculateEngagementScore(opened: number, clicked: number, delivered: number): number {
    if (delivered === 0) return 0;

    const openRate = opened / delivered;
    const clickRate = clicked / delivered;

    // Weighted scoring: opens = 40%, clicks = 60%
    return Math.round((openRate * 40) + (clickRate * 60));
  }

  static isEngaged(openedAt: Date | null, clickedAt: Date | null): boolean {
    return openedAt !== null || clickedAt !== null;
  }

  static isHighlyEngaged(openedAt: Date | null, clickedAt: Date | null): boolean {
    return clickedAt !== null;
  }
}