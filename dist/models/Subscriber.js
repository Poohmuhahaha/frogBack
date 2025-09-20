"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subscriber = void 0;
const uuid_1 = require("uuid");
class Subscriber {
    constructor(pool) {
        this.pool = pool;
    }
    async create(subscriberData) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        const query = `
      INSERT INTO subscribers (
        id, email, name, status, source, tags, email_verified,
        engagement_score, subscribed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
        const values = [
            id,
            subscriberData.email,
            subscriberData.name || null,
            'active', // Default status
            subscriberData.source,
            subscriberData.tags || [],
            false, // email_verified defaults to false
            0, // Initial engagement score
            now
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async findById(id) {
        const query = 'SELECT * FROM subscribers WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByEmail(email) {
        const query = 'SELECT * FROM subscribers WHERE email = $1';
        const result = await this.pool.query(query, [email]);
        return result.rows[0] || null;
    }
    async findMany(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramCount = 0;
        // Build WHERE clause dynamically
        if (filters.status) {
            paramCount++;
            whereClause += ` AND status = $${paramCount}`;
            values.push(filters.status);
        }
        if (filters.source) {
            paramCount++;
            whereClause += ` AND source = $${paramCount}`;
            values.push(filters.source);
        }
        if (filters.email_verified !== undefined) {
            paramCount++;
            whereClause += ` AND email_verified = $${paramCount}`;
            values.push(filters.email_verified);
        }
        if (filters.tags && filters.tags.length > 0) {
            paramCount++;
            whereClause += ` AND tags @> $${paramCount}`;
            values.push(JSON.stringify(filters.tags));
        }
        if (filters.engagement_score_min !== undefined) {
            paramCount++;
            whereClause += ` AND engagement_score >= $${paramCount}`;
            values.push(filters.engagement_score_min);
        }
        if (filters.engagement_score_max !== undefined) {
            paramCount++;
            whereClause += ` AND engagement_score <= $${paramCount}`;
            values.push(filters.engagement_score_max);
        }
        if (filters.search) {
            paramCount++;
            whereClause += ` AND (email ILIKE $${paramCount} OR name ILIKE $${paramCount})`;
            values.push(`%${filters.search}%`);
        }
        // Count total results
        const countQuery = `SELECT COUNT(*) FROM subscribers ${whereClause}`;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results
        let query = `SELECT * FROM subscribers ${whereClause} ORDER BY subscribed_at DESC`;
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
        return { subscribers: result.rows, total };
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
      UPDATE subscribers
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
    async unsubscribe(id) {
        const query = `
      UPDATE subscribers
      SET status = 'unsubscribed', unsubscribed_at = $1
      WHERE id = $2
      RETURNING *
    `;
        const result = await this.pool.query(query, [new Date(), id]);
        return result.rows[0] || null;
    }
    async unsubscribeByEmail(email) {
        const query = `
      UPDATE subscribers
      SET status = 'unsubscribed', unsubscribed_at = $1
      WHERE email = $2
      RETURNING *
    `;
        const result = await this.pool.query(query, [new Date(), email]);
        return result.rows[0] || null;
    }
    async resubscribe(id) {
        const query = `
      UPDATE subscribers
      SET status = 'active', unsubscribed_at = NULL
      WHERE id = $1
      RETURNING *
    `;
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async updateEngagementScore(id) {
        // Calculate engagement score based on email campaign stats
        const scoreQuery = `
      SELECT
        COUNT(*) as total_emails,
        COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opens,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicks
      FROM email_campaign_stats
      WHERE subscriber_id = $1
      AND delivered_at > NOW() - INTERVAL '90 days'
    `;
        const scoreResult = await this.pool.query(scoreQuery, [id]);
        const stats = scoreResult.rows[0];
        let engagementScore = 0;
        if (stats.total_emails > 0) {
            const openRate = stats.opens / stats.total_emails;
            const clickRate = stats.clicks / stats.total_emails;
            // Weighted scoring: opens = 40%, clicks = 60%
            engagementScore = Math.round((openRate * 40) + (clickRate * 60));
        }
        return this.update(id, { engagement_score: engagementScore });
    }
    async emailExists(email) {
        const query = 'SELECT 1 FROM subscribers WHERE email = $1';
        const result = await this.pool.query(query, [email]);
        return result.rows.length > 0;
    }
    async getActiveCount() {
        const query = 'SELECT COUNT(*) FROM subscribers WHERE status = $1';
        const result = await this.pool.query(query, ['active']);
        return parseInt(result.rows[0].count);
    }
    async getBounceRate() {
        const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
      FROM subscribers
    `;
        const result = await this.pool.query(query);
        const stats = result.rows[0];
        if (stats.total === 0)
            return 0;
        return (stats.bounced / stats.total) * 100;
    }
    async delete(id) {
        const query = 'DELETE FROM subscribers WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Validation methods
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    static validateSource(source) {
        return ['website', 'social', 'referral', 'import'].includes(source);
    }
    static validateStatus(status) {
        return ['active', 'unsubscribed', 'bounced'].includes(status);
    }
    static validateEngagementScore(score) {
        return score >= 0 && score <= 100;
    }
    static validateTags(tags) {
        if (tags.length > 20)
            return false; // Max 20 tags
        return tags.every(tag => tag.length > 0 && tag.length <= 50);
    }
}
exports.Subscriber = Subscriber;
//# sourceMappingURL=Subscriber.js.map