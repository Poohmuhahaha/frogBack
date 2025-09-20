"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionPlan = void 0;
const uuid_1 = require("uuid");
class SubscriptionPlan {
    constructor(pool) {
        this.pool = pool;
    }
    async create(planData) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        const query = `
      INSERT INTO subscription_plans (
        id, creator_id, name, description, price, currency, features,
        is_active, stripe_price_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        const values = [
            id,
            planData.creator_id,
            planData.name,
            planData.description,
            planData.price,
            planData.currency,
            planData.features,
            true, // Default to active
            planData.stripe_price_id || null,
            now,
            now
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async findById(id) {
        const query = 'SELECT * FROM subscription_plans WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByCreatorId(creatorId) {
        const query = `
      SELECT * FROM subscription_plans
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
        if (filters.is_active !== undefined) {
            paramCount++;
            whereClause += ` AND is_active = $${paramCount}`;
            values.push(filters.is_active);
        }
        if (filters.currency) {
            paramCount++;
            whereClause += ` AND currency = $${paramCount}`;
            values.push(filters.currency);
        }
        if (filters.price_min !== undefined) {
            paramCount++;
            whereClause += ` AND price >= $${paramCount}`;
            values.push(filters.price_min);
        }
        if (filters.price_max !== undefined) {
            paramCount++;
            whereClause += ` AND price <= $${paramCount}`;
            values.push(filters.price_max);
        }
        if (filters.search) {
            paramCount++;
            whereClause += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
            values.push(`%${filters.search}%`);
        }
        // Count total results
        const countQuery = `SELECT COUNT(*) FROM subscription_plans ${whereClause}`;
        const countResult = await this.pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        // Get paginated results
        let query = `SELECT * FROM subscription_plans ${whereClause} ORDER BY created_at DESC`;
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
        return { plans: result.rows, total };
    }
    async findActive() {
        const query = `
      SELECT * FROM subscription_plans
      WHERE is_active = true
      ORDER BY price ASC
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
        fields.push(`updated_at = $${paramCount}`);
        values.push(new Date());
        values.push(id);
        const query = `
      UPDATE subscription_plans
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
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
    async updateStripeId(id, stripePriceId) {
        return this.update(id, { stripe_price_id: stripePriceId });
    }
    async getSubscriberCount(planId) {
        const query = `
      SELECT COUNT(*) FROM subscriptions
      WHERE plan_id = $1 AND status = 'active'
    `;
        const result = await this.pool.query(query, [planId]);
        return parseInt(result.rows[0].count);
    }
    async getMonthlyRevenue(planId) {
        const query = `
      SELECT
        sp.price,
        COUNT(s.id) as active_subscriptions
      FROM subscription_plans sp
      LEFT JOIN subscriptions s ON sp.id = s.plan_id AND s.status = 'active'
      WHERE sp.id = $1
      GROUP BY sp.price
    `;
        const result = await this.pool.query(query, [planId]);
        if (result.rows.length === 0)
            return 0;
        const { price, active_subscriptions } = result.rows[0];
        return price * active_subscriptions;
    }
    async delete(id) {
        // Soft delete by deactivating instead of hard delete to preserve subscription history
        const result = await this.update(id, { is_active: false });
        return result !== null;
    }
    async hardDelete(id) {
        // Only allow hard delete if no subscriptions exist
        const subscriptionCheck = await this.pool.query('SELECT 1 FROM subscriptions WHERE plan_id = $1 LIMIT 1', [id]);
        if (subscriptionCheck.rows.length > 0) {
            throw new Error('Cannot delete subscription plan with existing subscriptions');
        }
        const query = 'DELETE FROM subscription_plans WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Validation methods
    static validateName(name) {
        return name.length > 0 && name.length <= 100;
    }
    static validateDescription(description) {
        return description.length > 0 && description.length <= 500;
    }
    static validatePrice(price) {
        return price > 0 && price <= 100000000; // Max $1M in cents
    }
    static validateCurrency(currency) {
        // Common currency codes
        const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
        return validCurrencies.includes(currency.toUpperCase());
    }
    static validateFeatures(features) {
        if (features.length === 0 || features.length > 20)
            return false;
        return features.every(feature => feature.length > 0 && feature.length <= 200);
    }
    static formatPrice(priceInCents, currency) {
        const price = priceInCents / 100;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(price);
    }
    static calculateAnnualPrice(monthlyPriceInCents, discountPercent = 0) {
        const annualPrice = monthlyPriceInCents * 12;
        const discount = annualPrice * (discountPercent / 100);
        return Math.round(annualPrice - discount);
    }
}
exports.SubscriptionPlan = SubscriptionPlan;
//# sourceMappingURL=SubscriptionPlan.js.map