"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCampaign = void 0;
const uuid_1 = require("uuid");
class EmailCampaign {
    constructor(pool) {
        this.pool = pool;
    }
    async create(campaignData) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        const query = `
      INSERT INTO email_campaigns (
        id, creator_id, name, subject, content, type, status,
        scheduled_at, recipient_count, open_rate, click_rate, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
        const values = [
            id,
            campaignData.creator_id,
            campaignData.name,
            campaignData.subject,
            campaignData.content,
            campaignData.type,
            campaignData.scheduled_at ? 'scheduled' : 'draft',
            campaignData.scheduled_at || null,
            0, // Initial recipient count
            0, // Initial open rate
            0, // Initial click rate
            now
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async findById(id) {
        const query = 'SELECT * FROM email_campaigns WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByCreatorId(creatorId) {
        const query = `
      SELECT * FROM email_campaigns
      WHERE creator_id = $1
      ORDER BY created_at DESC
    `;
        const result = await this.pool.query(query, [creatorId]);
        return result.rows;
    }
    async findMany(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramCount = 0;
        // Build WHERE clause dynamically
        if (filters.creator_id) {
            paramCount++;
            whereClause += ` AND creator_id = $${paramCount}`;
            values.push(filters.creator_id);
        }
        if (filters.type) {
            paramCount++;
            whereClause += ` AND type = $${paramCount}`;
            values.push(filters.type);
        }
        if (filters.status) {
            paramCount++;
            whereClause += ` AND status = $${paramCount}`;
            values.push(filters.status);
        }
        if (filters.search) {
            paramCount++;
            whereClause += ` AND (name ILIKE $${paramCount} OR subject ILIKE $${paramCount})`;
            values.push(`%${filters.search}%`);
        }
        // Count total results
        const countQuery = `SELECT COUNT(*) FROM email_campaigns ${whereClause}`;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results
        let query = `SELECT * FROM email_campaigns ${whereClause} ORDER BY created_at DESC`;
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
        return { campaigns: result.rows, total };
    }
    async findScheduled() {
        const query = `
      SELECT * FROM email_campaigns
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
    `;
        const result = await this.pool.query(query);
        return result.rows;
    }
    async update(id, updateData) {
        const fields = [];
        const values = [];
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
      UPDATE email_campaigns
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
    async schedule(id, scheduledAt) {
        return this.update(id, {
            status: 'scheduled',
            scheduled_at: scheduledAt
        });
    }
    async startSending(id, recipientCount) {
        return this.update(id, {
            status: 'sending',
            recipient_count: recipientCount
        });
    }
    async markSent(id) {
        return this.update(id, {
            status: 'sent',
            sent_at: new Date()
        });
    }
    async markFailed(id) {
        return this.update(id, {
            status: 'failed'
        });
    }
    async updateStats(id) {
        // Calculate open and click rates from email_campaign_stats
        const statsQuery = `
      SELECT
        COUNT(*) as total_delivered,
        COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as total_opens,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as total_clicks
      FROM email_campaign_stats
      WHERE campaign_id = $1 AND delivered_at IS NOT NULL
    `;
        const statsResult = await this.pool.query(statsQuery, [id]);
        const stats = statsResult.rows[0];
        let openRate = 0;
        let clickRate = 0;
        if (stats.total_delivered > 0) {
            openRate = (stats.total_opens / stats.total_delivered) * 100;
            clickRate = (stats.total_clicks / stats.total_delivered) * 100;
        }
        return this.update(id, {
            open_rate: Math.round(openRate * 100) / 100, // Round to 2 decimal places
            click_rate: Math.round(clickRate * 100) / 100
        });
    }
    async getStats(creatorId) {
        const query = `
      SELECT
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_campaigns,
        AVG(CASE WHEN status = 'sent' AND open_rate > 0 THEN open_rate END) as avg_open_rate,
        AVG(CASE WHEN status = 'sent' AND click_rate > 0 THEN click_rate END) as avg_click_rate,
        SUM(CASE WHEN status = 'sent' THEN recipient_count ELSE 0 END) as total_recipients
      FROM email_campaigns
      WHERE creator_id = $1
    `;
        const result = await this.pool.query(query, [creatorId]);
        const stats = result.rows[0];
        return {
            total_campaigns: parseInt(stats.total_campaigns) || 0,
            sent_campaigns: parseInt(stats.sent_campaigns) || 0,
            avg_open_rate: parseFloat(stats.avg_open_rate) || 0,
            avg_click_rate: parseFloat(stats.avg_click_rate) || 0,
            total_recipients: parseInt(stats.total_recipients) || 0
        };
    }
    async getRecentCampaigns(creatorId, limit = 5) {
        const query = `
      SELECT * FROM email_campaigns
      WHERE creator_id = $1 AND status = 'sent'
      ORDER BY sent_at DESC
      LIMIT $2
    `;
        const result = await this.pool.query(query, [creatorId, limit]);
        return result.rows;
    }
    async duplicate(id, newName) {
        const original = await this.findById(id);
        if (!original)
            return null;
        const duplicateData = {
            creator_id: original.creator_id,
            name: newName,
            subject: original.subject,
            content: original.content,
            type: original.type
        };
        return this.create(duplicateData);
    }
    async delete(id) {
        // Only allow deletion of draft campaigns
        const campaign = await this.findById(id);
        if (!campaign || campaign.status !== 'draft') {
            return false;
        }
        const query = 'DELETE FROM email_campaigns WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Validation methods
    static validateName(name) {
        return name.length > 0 && name.length <= 200;
    }
    static validateSubject(subject) {
        return subject.length > 0 && subject.length <= 300;
    }
    static validateContent(content) {
        return content.length > 0 && content.length <= 1000000; // Max 1MB
    }
    static validateType(type) {
        return ['newsletter', 'automation', 'announcement'].includes(type);
    }
    static validateStatus(status) {
        return ['draft', 'scheduled', 'sending', 'sent', 'failed'].includes(status);
    }
    static canEdit(status) {
        return ['draft', 'scheduled'].includes(status);
    }
    static canDelete(status) {
        return status === 'draft';
    }
    static canSend(status) {
        return ['draft', 'scheduled'].includes(status);
    }
}
exports.EmailCampaign = EmailCampaign;
//# sourceMappingURL=EmailCampaign.js.map