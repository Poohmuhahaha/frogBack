import { Pool } from 'pg';
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
export declare class Subscription {
    private pool;
    constructor(pool: Pool);
    create(subscriptionData: CreateSubscriptionData): Promise<SubscriptionData>;
    findById(id: string): Promise<SubscriptionData | null>;
    findByStripeId(stripeSubscriptionId: string): Promise<SubscriptionData | null>;
    findBySubscriberId(subscriberId: string): Promise<SubscriptionData[]>;
    findActiveBySubscriberId(subscriberId: string): Promise<SubscriptionData[]>;
    findByPlanId(planId: string): Promise<SubscriptionData[]>;
    findMany(filters?: SubscriptionFilters): Promise<{
        subscriptions: SubscriptionData[];
        total: number;
    }>;
    findManyWithPlan(filters?: SubscriptionFilters): Promise<{
        subscriptions: SubscriptionWithPlan[];
        total: number;
    }>;
    update(id: string, updateData: UpdateSubscriptionData): Promise<SubscriptionData | null>;
    activate(id: string, currentPeriodStart?: Date, currentPeriodEnd?: Date): Promise<SubscriptionData | null>;
    cancel(id: string): Promise<SubscriptionData | null>;
    setPastDue(id: string): Promise<SubscriptionData | null>;
    hasActiveSubscription(subscriberId: string, planId: string): Promise<boolean>;
    hasAnyActiveSubscription(subscriberId: string): Promise<boolean>;
    getActiveCount(): Promise<number>;
    getActiveCountByPlan(planId: string): Promise<number>;
    getMonthlyRevenue(): Promise<number>;
    getChurnRate(days?: number): Promise<number>;
    getSubscriptionsExpiringInDays(days: number): Promise<SubscriptionData[]>;
    delete(id: string): Promise<boolean>;
    static validateStatus(status: string): boolean;
    static isActiveStatus(status: string): boolean;
    static isCanceledStatus(status: string): boolean;
    static isPastDueStatus(status: string): boolean;
    static calculateDaysUntilExpiry(currentPeriodEnd: Date): number;
}
//# sourceMappingURL=Subscription.d.ts.map