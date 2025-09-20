import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface SubscriptionData {
  id?: string;
  subscriber_id: string;
  plan_id: string;
  stripe_subscription_id?: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  current_period_start?: Date;
  current_period_end?: Date;
  created_at?: Date;
  canceled_at?: Date;
}

export interface CreateSubscriptionData {
  subscriber_id: string;
  plan_id: string;
  stripe_subscription_id?: string;
  current_period_start?: Date;
  current_period_end?: Date;
}

export interface UpdateSubscriptionData {
  status?: 'active' | 'past_due' | 'canceled' | 'incomplete';
  stripe_subscription_id?: string;
  current_period_start?: Date;
  current_period_end?: Date;
}

export interface SubscriptionFilters {
  subscriber_id?: string;
  plan_id?: string;
  status?: 'active' | 'past_due' | 'canceled' | 'incomplete';
  stripe_subscription_id?: string;
  limit?: number;
  offset?: number;
}

export interface SubscriptionWithPlan extends SubscriptionData {
  plan_name?: string;
  plan_price?: number;
  plan_currency?: string;
  plan_features?: string[];
}

export class Subscription {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(subscriptionData: CreateSubscriptionData): Promise<SubscriptionData> {
    const id = uuidv4();
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

  async findById(id: string): Promise<SubscriptionData | null> {
    const query = 'SELECT * FROM subscriptions WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByStripeId(stripeSubscriptionId: string): Promise<SubscriptionData | null> {
    const query = 'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1';
    const result = await this.pool.query(query, [stripeSubscriptionId]);
    return result.rows[0] || null;
  }

  async findBySubscriberId(subscriberId: string): Promise<SubscriptionData[]> {
    const query = `
      SELECT * FROM subscriptions
      WHERE subscriber_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [subscriberId]);
    return result.rows;
  }

  async findActiveBySubscriberId(subscriberId: string): Promise<SubscriptionData[]> {
    const query = `
      SELECT * FROM subscriptions
      WHERE subscriber_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [subscriberId]);
    return result.rows;
  }

  async findByPlanId(planId: string): Promise<SubscriptionData[]> {
    const query = `
      SELECT * FROM subscriptions
      WHERE plan_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [planId]);
    return result.rows;
  }

  async findMany(filters: SubscriptionFilters = {}): Promise<{ subscriptions: SubscriptionData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
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

  async findManyWithPlan(filters: SubscriptionFilters = {}): Promise<{ subscriptions: SubscriptionWithPlan[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
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

  async update(id: string, updateData: UpdateSubscriptionData): Promise<SubscriptionData | null> {
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
      UPDATE subscriptions
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async activate(id: string, currentPeriodStart?: Date, currentPeriodEnd?: Date): Promise<SubscriptionData | null> {
    const updateData: UpdateSubscriptionData = { status: 'active' };

    if (currentPeriodStart) {
      updateData.current_period_start = currentPeriodStart;
    }

    if (currentPeriodEnd) {
      updateData.current_period_end = currentPeriodEnd;
    }

    return this.update(id, updateData);
  }

  async cancel(id: string): Promise<SubscriptionData | null> {
    const query = `
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [new Date(), id]);
    return result.rows[0] || null;
  }

  async setPastDue(id: string): Promise<SubscriptionData | null> {
    return this.update(id, { status: 'past_due' });
  }

  async hasActiveSubscription(subscriberId: string, planId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM subscriptions
      WHERE subscriber_id = $1 AND plan_id = $2 AND status = 'active'
      LIMIT 1
    `;

    const result = await this.pool.query(query, [subscriberId, planId]);
    return result.rows.length > 0;
  }

  async hasAnyActiveSubscription(subscriberId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM subscriptions
      WHERE subscriber_id = $1 AND status = 'active'
      LIMIT 1
    `;

    const result = await this.pool.query(query, [subscriberId]);
    return result.rows.length > 0;
  }

  async getActiveCount(): Promise<number> {
    const query = 'SELECT COUNT(*) FROM subscriptions WHERE status = $1';
    const result = await this.pool.query(query, ['active']);
    return parseInt(result.rows[0].count);
  }

  async getActiveCountByPlan(planId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM subscriptions
      WHERE plan_id = $1 AND status = 'active'
    `;
    const result = await this.pool.query(query, [planId]);
    return parseInt(result.rows[0].count);
  }

  async getMonthlyRevenue(): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(sp.price), 0) as revenue
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.status = 'active'
    `;

    const result = await this.pool.query(query);
    return parseInt(result.rows[0].revenue);
  }

  async getChurnRate(days: number = 30): Promise<number> {
    const query = `
      SELECT
        COUNT(*) as total_subscriptions,
        COUNT(CASE WHEN canceled_at IS NOT NULL AND canceled_at > NOW() - INTERVAL '${days} days' THEN 1 END) as canceled_subscriptions
      FROM subscriptions
      WHERE created_at <= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const { total_subscriptions, canceled_subscriptions } = result.rows[0];

    if (total_subscriptions === 0) return 0;
    return (canceled_subscriptions / total_subscriptions) * 100;
  }

  async getSubscriptionsExpiringInDays(days: number): Promise<SubscriptionData[]> {
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

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM subscriptions WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Validation methods
  static validateStatus(status: string): boolean {
    return ['active', 'past_due', 'canceled', 'incomplete'].includes(status);
  }

  static isActiveStatus(status: string): boolean {
    return status === 'active';
  }

  static isCanceledStatus(status: string): boolean {
    return status === 'canceled';
  }

  static isPastDueStatus(status: string): boolean {
    return status === 'past_due';
  }

  static calculateDaysUntilExpiry(currentPeriodEnd: Date): number {
    const now = new Date();
    const timeDiff = currentPeriodEnd.getTime() - now.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }
}