import { Pool } from 'pg';
import { SubscriptionData, SubscriptionWithPlan } from '../models/Subscription';
import { SubscriptionPlanData, CreateSubscriptionPlanData, UpdateSubscriptionPlanData } from '../models/SubscriptionPlan';
export interface CreateSubscriptionRequest {
    userId: string;
    planId: string;
    paymentMethodId: string;
    trialDays?: number;
    couponCode?: string;
}
export interface SubscriptionStats {
    totalSubscriptions: number;
    activeSubscriptions: number;
    canceledSubscriptions: number;
    monthlyRevenue: number;
    churnRate: number;
    averageRevenuePerUser: number;
}
export interface PlanWithStats extends SubscriptionPlanData {
    subscriberCount: number;
    monthlyRevenue: number;
    conversionRate?: number;
}
export interface BillingPortalSession {
    url: string;
    return_url?: string;
}
export interface CheckoutSession {
    id: string;
    url: string;
    customer_email?: string;
}
export interface WebhookEvent {
    id: string;
    type: string;
    data: any;
    created: number;
}
export declare class SubscriptionService {
    private subscription;
    private subscriptionPlan;
    private user;
    private pool;
    private stripe;
    constructor(pool: Pool, stripeSecretKey?: string);
    createPlan(planData: CreateSubscriptionPlanData): Promise<PlanWithStats>;
    updatePlan(planId: string, updateData: UpdateSubscriptionPlanData, creatorId?: string): Promise<PlanWithStats>;
    getPlan(planId: string): Promise<PlanWithStats | null>;
    getPlans(creatorId?: string): Promise<PlanWithStats[]>;
    deactivatePlan(planId: string, creatorId?: string): Promise<void>;
    createSubscription(request: CreateSubscriptionRequest): Promise<CheckoutSession>;
    getSubscription(subscriptionId: string, userId?: string): Promise<SubscriptionWithPlan | null>;
    getUserSubscriptions(userId: string): Promise<SubscriptionWithPlan[]>;
    getActiveUserSubscriptions(userId: string): Promise<SubscriptionWithPlan[]>;
    cancelSubscription(subscriptionId: string, userId?: string): Promise<SubscriptionData>;
    reactivateSubscription(subscriptionId: string, userId?: string): Promise<SubscriptionData>;
    createBillingPortalSession(userId: string, returnUrl?: string): Promise<BillingPortalSession>;
    getSubscriptionStats(creatorId?: string): Promise<SubscriptionStats>;
    handleStripeWebhook(event: WebhookEvent): Promise<void>;
    private findOrCreateStripeCustomer;
    private enrichPlanWithStats;
    private handleCheckoutCompleted;
    private handlePaymentSucceeded;
    private handlePaymentFailed;
    private handleSubscriptionUpdated;
    private handleSubscriptionDeleted;
    private mapStripeStatusToLocal;
    hasAccess(userId: string, planId: string): Promise<boolean>;
    hasAnyActiveSubscription(userId: string): Promise<boolean>;
    getUserAccessLevel(userId: string): Promise<'free' | 'premium'>;
}
//# sourceMappingURL=SubscriptionService.d.ts.map