"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AffiliateLink = void 0;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
class AffiliateLink {
    constructor(pool) {
        this.pool = pool;
    }
    async create(linkData) {
        const id = (0, uuid_1.v4)();
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
    async findById(id) {
        const query = 'SELECT * FROM affiliate_links WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByTrackingCode(trackingCode) {
        const query = 'SELECT * FROM affiliate_links WHERE tracking_code = $1';
        const result = await this.pool.query(query, [trackingCode]);
        return result.rows[0] || null;
    }
    async findByCreatorId(creatorId) {
        const query = `
      SELECT * FROM affiliate_links
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
    async findActive() {
        const query = `
      SELECT * FROM affiliate_links
      WHERE is_active = true
      ORDER BY created_at DESC
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
      UPDATE affiliate_links
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
    async activate(id) {
        return this.update(id, { is_active: true });
    }
    async deactivate(id) {
        return this.update(id, { is_active: false });
    }
    async getPerformance(linkId, days = 30) {
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
        if (result.rows.length === 0)
            return null;
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
    async getTopPerformingLinks(creatorId, limit = 10, days = 30) {
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
    async getTotalCommission(creatorId, days = 30) {
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
    async getClickCount(linkId, days = 30) {
        const query = `
      SELECT COUNT(*) as click_count
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
    `;
        const result = await this.pool.query(query, [linkId]);
        return parseInt(result.rows[0].click_count) || 0;
    }
    async getUniqueClickCount(linkId, days = 30) {
        const query = `
      SELECT COUNT(DISTINCT ip_address) as unique_clicks
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
    `;
        const result = await this.pool.query(query, [linkId]);
        return parseInt(result.rows[0].unique_clicks) || 0;
    }
    async regenerateTrackingCode(id) {
        const newTrackingCode = this.generateTrackingCode();
        return this.update(id, { tracking_code: newTrackingCode });
    }
    async delete(id) {
        // Soft delete by deactivating to preserve click statistics
        const result = await this.update(id, { is_active: false });
        return result !== null;
    }
    async hardDelete(id) {
        // Only allow hard delete if no click stats exist
        const statsCheck = await this.pool.query('SELECT 1 FROM affiliate_link_stats WHERE link_id = $1 LIMIT 1', [id]);
        if (statsCheck.rows.length > 0) {
            throw new Error('Cannot delete affiliate link with existing click statistics');
        }
        const query = 'DELETE FROM affiliate_links WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Utility methods
    generateTrackingCode() {
        return crypto_1.default.randomBytes(8).toString('hex').toUpperCase();
    }
    buildTrackedUrl(baseUrl, trackingCode) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}ref=${trackingCode}`;
    }
    // Validation methods
    static validateName(name) {
        return name.length > 0 && name.length <= 200;
    }
    static validateUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        }
        catch {
            return false;
        }
    }
    static validateNetwork(network) {
        return ['amazon', 'shareasale', 'cj', 'custom'].includes(network);
    }
    static validateCommissionRate(rate) {
        return rate >= 0 && rate <= 100;
    }
    static validateCategory(category) {
        return category.length <= 100;
    }
    static extractDomain(url) {
        try {
            return new URL(url).hostname;
        }
        catch {
            return '';
        }
    }
    static isTrackingCodeUnique(trackingCode, existingCodes) {
        return !existingCodes.includes(trackingCode);
    }
}
exports.AffiliateLink = AffiliateLink;
//# sourceMappingURL=AffiliateLink.js.map