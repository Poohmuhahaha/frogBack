"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AffiliateLinkStats = void 0;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
class AffiliateLinkStats {
    constructor(pool) {
        this.pool = pool;
    }
    async create(statsData) {
        const id = (0, uuid_1.v4)();
        const hashedIp = statsData.ip_address ? this.hashIpAddress(statsData.ip_address) : null;
        const now = new Date();
        const query = `
      INSERT INTO affiliate_link_stats (
        id, link_id, article_id, clicked_at, ip_address, user_agent,
        referrer, converted, commission_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
        const values = [
            id,
            statsData.link_id,
            statsData.article_id || null,
            now,
            hashedIp,
            statsData.user_agent || null,
            statsData.referrer || null,
            false, // Default not converted
            0 // Default commission amount
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async findById(id) {
        const query = 'SELECT * FROM affiliate_link_stats WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByLinkId(linkId) {
        const query = `
      SELECT * FROM affiliate_link_stats
      WHERE link_id = $1
      ORDER BY clicked_at DESC
    `;
        const result = await this.pool.query(query, [linkId]);
        return result.rows;
    }
    async findByArticleId(articleId) {
        const query = `
      SELECT * FROM affiliate_link_stats
      WHERE article_id = $1
      ORDER BY clicked_at DESC
    `;
        const result = await this.pool.query(query, [articleId]);
        return result.rows;
    }
    async findMany(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramCount = 0;
        // Build WHERE clause dynamically
        if (filters.link_id) {
            paramCount++;
            whereClause += ` AND link_id = $${paramCount}`;
            values.push(filters.link_id);
        }
        if (filters.article_id) {
            paramCount++;
            whereClause += ` AND article_id = $${paramCount}`;
            values.push(filters.article_id);
        }
        if (filters.converted !== undefined) {
            paramCount++;
            whereClause += ` AND converted = $${paramCount}`;
            values.push(filters.converted);
        }
        if (filters.date_from) {
            paramCount++;
            whereClause += ` AND clicked_at >= $${paramCount}`;
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            paramCount++;
            whereClause += ` AND clicked_at <= $${paramCount}`;
            values.push(filters.date_to);
        }
        // Count total results
        const countQuery = `SELECT COUNT(*) FROM affiliate_link_stats ${whereClause}`;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results
        let query = `SELECT * FROM affiliate_link_stats ${whereClause} ORDER BY clicked_at DESC`;
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
      UPDATE affiliate_link_stats
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
    async markConverted(id, commissionAmount) {
        return this.update(id, {
            converted: true,
            commission_amount: commissionAmount,
            conversion_date: new Date()
        });
    }
    async getAnalytics(linkId, days = 30) {
        // Main analytics query
        const analyticsQuery = `
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT ip_address) as unique_clicks,
        COUNT(CASE WHEN converted = true THEN 1 END) as conversions,
        COALESCE(SUM(CASE WHEN converted = true THEN commission_amount ELSE 0 END), 0) as total_commission
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
    `;
        const analyticsResult = await this.pool.query(analyticsQuery, [linkId]);
        const analytics = analyticsResult.rows[0];
        // Top sources query
        const sourcesQuery = `
      SELECT
        als.article_id,
        a.title as article_title,
        COUNT(*) as clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as conversions
      FROM affiliate_link_stats als
      LEFT JOIN articles a ON als.article_id = a.id
      WHERE als.link_id = $1
      AND als.clicked_at > NOW() - INTERVAL '${days} days'
      AND als.article_id IS NOT NULL
      GROUP BY als.article_id, a.title
      ORDER BY clicks DESC
      LIMIT 5
    `;
        const sourcesResult = await this.pool.query(sourcesQuery, [linkId]);
        const totalClicks = parseInt(analytics.total_clicks) || 0;
        const uniqueClicks = parseInt(analytics.unique_clicks) || 0;
        const conversions = parseInt(analytics.conversions) || 0;
        const totalCommission = parseInt(analytics.total_commission) || 0;
        return {
            total_clicks: totalClicks,
            unique_clicks: uniqueClicks,
            conversions,
            conversion_rate: totalClicks > 0 ? (conversions / totalClicks) * 100 : 0,
            total_commission: totalCommission,
            avg_commission_per_conversion: conversions > 0 ? totalCommission / conversions : 0,
            top_sources: sourcesResult.rows.map(row => ({
                article_id: row.article_id,
                article_title: row.article_title || 'Unknown Article',
                clicks: parseInt(row.clicks),
                conversions: parseInt(row.conversions)
            }))
        };
    }
    async getTimeSeriesData(linkId, days = 30) {
        const query = `
      SELECT
        DATE(clicked_at) as date,
        COUNT(*) as clicks,
        COUNT(CASE WHEN converted = true THEN 1 END) as conversions,
        COALESCE(SUM(CASE WHEN converted = true THEN commission_amount ELSE 0 END), 0) as commission
      FROM affiliate_link_stats
      WHERE link_id = $1
      AND clicked_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(clicked_at)
      ORDER BY date ASC
    `;
        const result = await this.pool.query(query, [linkId]);
        return result.rows.map(row => ({
            date: row.date.toISOString().split('T')[0], // Format as YYYY-MM-DD
            clicks: parseInt(row.clicks),
            conversions: parseInt(row.conversions),
            commission: parseInt(row.commission)
        }));
    }
    async getTopPerformingArticles(linkId, limit = 10, days = 30) {
        const query = `
      SELECT
        als.article_id,
        a.title as article_title,
        COUNT(*) as clicks,
        COUNT(CASE WHEN als.converted = true THEN 1 END) as conversions,
        COALESCE(SUM(CASE WHEN als.converted = true THEN als.commission_amount ELSE 0 END), 0) as commission
      FROM affiliate_link_stats als
      LEFT JOIN articles a ON als.article_id = a.id
      WHERE als.link_id = $1
      AND als.clicked_at > NOW() - INTERVAL '${days} days'
      AND als.article_id IS NOT NULL
      GROUP BY als.article_id, a.title
      ORDER BY clicks DESC, commission DESC
      LIMIT $2
    `;
        const result = await this.pool.query(query, [linkId, limit]);
        return result.rows.map(row => {
            const clicks = parseInt(row.clicks);
            const conversions = parseInt(row.conversions);
            return {
                article_id: row.article_id,
                article_title: row.article_title || 'Unknown Article',
                clicks,
                conversions,
                conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
                commission: parseInt(row.commission)
            };
        });
    }
    async getDailyCommission(creatorId, date) {
        const query = `
      SELECT COALESCE(SUM(als.commission_amount), 0) as daily_commission
      FROM affiliate_link_stats als
      JOIN affiliate_links al ON als.link_id = al.id
      WHERE al.creator_id = $1
      AND als.converted = true
      AND DATE(als.conversion_date) = DATE($2)
    `;
        const result = await this.pool.query(query, [creatorId, date]);
        return parseInt(result.rows[0].daily_commission) || 0;
    }
    async getMonthlyCommission(creatorId, year, month) {
        const query = `
      SELECT COALESCE(SUM(als.commission_amount), 0) as monthly_commission
      FROM affiliate_link_stats als
      JOIN affiliate_links al ON als.link_id = al.id
      WHERE al.creator_id = $1
      AND als.converted = true
      AND EXTRACT(YEAR FROM als.conversion_date) = $2
      AND EXTRACT(MONTH FROM als.conversion_date) = $3
    `;
        const result = await this.pool.query(query, [creatorId, year, month]);
        return parseInt(result.rows[0].monthly_commission) || 0;
    }
    async trackClick(linkId, articleId, ipAddress, userAgent, referrer) {
        return this.create({
            link_id: linkId,
            article_id: articleId,
            ip_address: ipAddress,
            user_agent: userAgent,
            referrer: referrer
        });
    }
    async bulkCreate(statsDataArray) {
        if (statsDataArray.length === 0)
            return [];
        const values = [];
        const placeholders = [];
        statsDataArray.forEach((statsData, index) => {
            const id = (0, uuid_1.v4)();
            const hashedIp = statsData.ip_address ? this.hashIpAddress(statsData.ip_address) : null;
            const now = new Date();
            const offset = index * 8;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
            values.push(id, statsData.link_id, statsData.article_id || null, now, hashedIp, statsData.user_agent || null, statsData.referrer || null, false // Default not converted
            );
        });
        const query = `
      INSERT INTO affiliate_link_stats (
        id, link_id, article_id, clicked_at, ip_address, user_agent, referrer, converted
      ) VALUES ${placeholders.join(', ')}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows;
    }
    async delete(id) {
        const query = 'DELETE FROM affiliate_link_stats WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    async deleteByLinkId(linkId) {
        const query = 'DELETE FROM affiliate_link_stats WHERE link_id = $1';
        const result = await this.pool.query(query, [linkId]);
        return result.rowCount || 0;
    }
    async deleteOldStats(daysToKeep = 365) {
        const query = `
      DELETE FROM affiliate_link_stats
      WHERE clicked_at < NOW() - INTERVAL '${daysToKeep} days'
    `;
        const result = await this.pool.query(query);
        return result.rowCount || 0;
    }
    // Utility methods
    hashIpAddress(ipAddress) {
        return crypto_1.default.createHash('sha256').update(ipAddress).digest('hex');
    }
    static isUniqueClick(ipAddress, existingHashes) {
        const hashedIp = crypto_1.default.createHash('sha256').update(ipAddress).digest('hex');
        return !existingHashes.includes(hashedIp);
    }
    static extractReferrerDomain(referrer) {
        try {
            return new URL(referrer).hostname;
        }
        catch {
            return 'direct';
        }
    }
    static parseUserAgent(userAgent) {
        // Simple user agent parsing - in production, use a proper library
        const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
        const isTablet = /iPad|Tablet/.test(userAgent);
        let browser = 'Unknown';
        if (userAgent.includes('Chrome'))
            browser = 'Chrome';
        else if (userAgent.includes('Firefox'))
            browser = 'Firefox';
        else if (userAgent.includes('Safari'))
            browser = 'Safari';
        else if (userAgent.includes('Edge'))
            browser = 'Edge';
        let os = 'Unknown';
        if (userAgent.includes('Windows'))
            os = 'Windows';
        else if (userAgent.includes('Mac'))
            os = 'macOS';
        else if (userAgent.includes('Linux'))
            os = 'Linux';
        else if (userAgent.includes('Android'))
            os = 'Android';
        else if (userAgent.includes('iOS'))
            os = 'iOS';
        const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
        return { browser, os, device };
    }
}
exports.AffiliateLinkStats = AffiliateLinkStats;
//# sourceMappingURL=AffiliateLinkStats.js.map