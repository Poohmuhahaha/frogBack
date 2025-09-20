"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subscription = void 0;
const uuid_1 = require("uuid");
class Subscription {
    constructor(pool) {
        this.pool = pool;
    }
    async create(subscriptionData) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        const query = `
      INSERT INTO subscriptions (
        id, subscriber_id, plan_id, stripe_subscription_id, status,
        current_period_start, current_period_end, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const values = [
            id,
            subscriptionData.subscriber_id,
            subscriptionData.plan_id,
            subscriptionData.stripe_subscription_id || null,
            'incomplete', // Default status until payment confirmed
            subscriptionData.current_period_start || now,
            subscriptionData.current_period_end || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days default
            now
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async findById(id) {
        const query = 'SELECT * FROM subscriptions WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByStripeId(stripeSubscriptionId) {
        const query = 'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1';
        const result = await this.pool.query(query, [stripeSubscriptionId]);
        return result.rows[0] || null;
    }
    async findBySubscriberId(subscriberId) {
        const query = `
      SELECT * FROM subscriptions
      WHERE subscriber_id = $1
      ORDER BY created_at DESC
    `;
        const result = await this.pool.query(query, [subscriberId]);
        return result.rows;
    }
    async findActiveBySubscriberId(subscriberId) {
        const query = `
      SELECT * FROM subscriptions
      WHERE subscriber_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `;
        const result = await this.pool.query(query, [subscriberId]);
        return result.rows;
    }
    async findByPlanId(planId) {
        const query = `
      SELECT * FROM subscriptions
      WHERE plan_id = $1
      ORDER BY created_at DESC
    `;
        const result = await this.pool.query(query, [planId]);
        return result.rows;
    }
    async findMany(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramCount = 0;
        // Build WHERE clause dynamically
        if (filters.subscriber_id) {
            paramCount++;
            whereClause += ` AND subscriber_id = $${paramCount}`;
            values.push(filters.subscriber_id);
        }
        if (filters.plan_id) {
            paramCount++;
            whereClause += ` AND plan_id = $${paramCount}`;
            values.push(filters.plan_id);
        }
        if (filters.status) {
            paramCount++;
            whereClause += ` AND status = $${paramCount}`;
            values.push(filters.status);
        }
        if (filters.stripe_subscription_id) {
            paramCount++;
            whereClause += ` AND stripe_subscription_id = $${paramCount}`;
            values.push(filters.stripe_subscription_id);
        }
        // Count total results
        const countQuery = `SELECT COUNT(*) FROM subscriptions ${whereClause}`;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results
        let query = `SELECT * FROM subscriptions ${whereClause} ORDER BY created_at DESC`;
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
        return { subscriptions: result.rows, total };
    }
    async findManyWithPlan(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramCount = 0;
        // Build WHERE clause dynamically
        if (filters.subscriber_id) {
            paramCount++;
            whereClause += ` AND s.subscriber_id = $${paramCount}`;
            values.push(filters.subscriber_id);
        }
        if (filters.plan_id) {
            paramCount++;
            whereClause += ` AND s.plan_id = $${paramCount}`;
            values.push(filters.plan_id);
        }
        if (filters.status) {
            paramCount++;
            whereClause += ` AND s.status = $${paramCount}`;
            values.push(filters.status);
        }
        // Count total results
        const countQuery = `
      SELECT COUNT(*)
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      ${whereClause}
    `;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results with plan details
        let query = `
      SELECT
        s.*,
        sp.name as plan_name,
        sp.price as plan_price,
        sp.currency as plan_currency,
        sp.features as plan_features
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      ${whereClause}
      ORDER BY s.created_at DESC
    `;
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
        return { subscriptions: result.rows, total };
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
      UPDATE subscriptions
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
    async activate(id, currentPeriodStart, currentPeriodEnd) {
        const updateData = { status: 'active' };
        if (currentPeriodStart) {
            updateData.current_period_start = currentPeriodStart;
        }
        if (currentPeriodEnd) {
            updateData.current_period_end = currentPeriodEnd;
        }
        return this.update(id, updateData);
    }
    async cancel(id) {
        const query = `
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = $1
      WHERE id = $2
      RETURNING *
    `;
        const result = await this.pool.query(query, [new Date(), id]);
        return result.rows[0] || null;
    }
    async setPastDue(id) {
        return this.update(id, { status: 'past_due' });
    }
    async hasActiveSubscription(subscriberId, planId) {
        const query = `
      SELECT 1 FROM subscriptions
      WHERE subscriber_id = $1 AND plan_id = $2 AND status = 'active'
      LIMIT 1
    `;
        const result = await this.pool.query(query, [subscriberId, planId]);
        return result.rows.length > 0;
    }
    async hasAnyActiveSubscription(subscriberId) {
        const query = `
      SELECT 1 FROM subscriptions
      WHERE subscriber_id = $1 AND status = 'active'
      LIMIT 1
    `;
        const result = await this.pool.query(query, [subscriberId]);
        return result.rows.length > 0;
    }
    async getActiveCount() {
        const query = 'SELECT COUNT(*) FROM subscriptions WHERE status = $1';
        const result = await this.pool.query(query, ['active']);
        return parseInt(result.rows[0].count);
    }
    async getActiveCountByPlan(planId) {
        const query = `
      SELECT COUNT(*) FROM subscriptions
      WHERE plan_id = $1 AND status = 'active'
    `;
        const result = await this.pool.query(query, [planId]);
        return parseInt(result.rows[0].count);
    }
    async getMonthlyRevenue() {
        const query = `
      SELECT COALESCE(SUM(sp.price), 0) as revenue
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.status = 'active'
    `;
        const result = await this.pool.query(query);
        return parseInt(result.rows[0].revenue);
    }
    async getChurnRate(days = 30) {
        const query = `
      SELECT
        COUNT(*) as total_subscriptions,
        COUNT(CASE WHEN canceled_at IS NOT NULL AND canceled_at > NOW() - INTERVAL '${days} days' THEN 1 END) as canceled_subscriptions
      FROM subscriptions
      WHERE created_at <= NOW() - INTERVAL '${days} days'
    `;
        const result = await this.pool.query(query);
        const { total_subscriptions, canceled_subscriptions } = result.rows[0];
        if (total_subscriptions === 0)
            return 0;
        return (canceled_subscriptions / total_subscriptions) * 100;
    }
    async getSubscriptionsExpiringInDays(days) {
        const query = `
      SELECT * FROM subscriptions
      WHERE status = 'active'
      AND current_period_end <= NOW() + INTERVAL '${days} days'
      AND current_period_end > NOW()
      ORDER BY current_period_end ASC
    `;
        const result = await this.pool.query(query);
        return result.rows;
    }
    async delete(id) {
        const query = 'DELETE FROM subscriptions WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Validation methods
    static validateStatus(status) {
        return ['active', 'past_due', 'canceled', 'incomplete'].includes(status);
    }
    static isActiveStatus(status) {
        return status === 'active';
    }
    static isCanceledStatus(status) {
        return status === 'canceled';
    }
    static isPastDueStatus(status) {
        return status === 'past_due';
    }
    static calculateDaysUntilExpiry(currentPeriodEnd) {
        const now = new Date();
        const timeDiff = currentPeriodEnd.getTime() - now.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    }
}
exports.Subscription = Subscription;
//# sourceMappingURL=Subscription.js.map