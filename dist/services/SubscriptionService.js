"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const Subscription_1 = require("../models/Subscription");
const SubscriptionPlan_1 = require("../models/SubscriptionPlan");
const User_1 = require("../models/User");
class SubscriptionService {
    constructor(pool, stripeSecretKey) {
        this.pool = pool;
        this.subscription = new Subscription_1.Subscription(pool);
        this.subscriptionPlan = new SubscriptionPlan_1.SubscriptionPlan(pool);
        this.user = new User_1.User(pool);
        // Initialize Stripe
        const apiKey = stripeSecretKey || process.env.STRIPE_SECRET_KEY;
        if (!apiKey) {
            throw new Error('Stripe secret key is required');
        }
        this.stripe = new stripe_1.default(apiKey, {
            apiVersion: '2025-08-27.basil'
        });
    }
    // Subscription Plan Management
    async createPlan(planData) {
        // Validate plan data
        if (!SubscriptionPlan_1.SubscriptionPlan.validateName(planData.name)) {
            throw new Error('Invalid plan name: must be 1-100 characters');
        }
        if (!SubscriptionPlan_1.SubscriptionPlan.validateDescription(planData.description)) {
            throw new Error('Invalid description: must be 1-500 characters');
        }
        if (!SubscriptionPlan_1.SubscriptionPlan.validatePrice(planData.price)) {
            throw new Error('Invalid price: must be between $0.01 and $1,000,000');
        }
        if (!SubscriptionPlan_1.SubscriptionPlan.validateCurrency(planData.currency)) {
            throw new Error('Invalid currency code');
        }
        if (!SubscriptionPlan_1.SubscriptionPlan.validateFeatures(planData.features)) {
            throw new Error('Invalid features: maximum 20 features, each 1-200 characters');
        }
        // Create Stripe product and price if no stripe_price_id provided
        let stripePriceId = planData.stripe_price_id;
        if (!stripePriceId) {
            const stripeProduct = await this.stripe.products.create({
                name: planData.name,
                description: planData.description
            });
            const stripePrice = await this.stripe.prices.create({
                product: stripeProduct.id,
                unit_amount: planData.price,
                currency: planData.currency.toLowerCase(),
                recurring: { interval: 'month' }
            });
            stripePriceId = stripePrice.id;
        }
        // Create plan in database
        const newPlan = await this.subscriptionPlan.create({
            ...planData,
            stripe_price_id: stripePriceId
        });
        return this.enrichPlanWithStats(newPlan);
    }
    async updatePlan(planId, updateData, creatorId) {
        // Verify plan exists and user has permission
        const existingPlan = await this.subscriptionPlan.findById(planId);
        if (!existingPlan) {
            throw new Error('Subscription plan not found');
        }
        if (creatorId && existingPlan.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only edit your own subscription plans');
        }
        // Validate update data
        if (updateData.name && !SubscriptionPlan_1.SubscriptionPlan.validateName(updateData.name)) {
            throw new Error('Invalid plan name: must be 1-100 characters');
        }
        if (updateData.description && !SubscriptionPlan_1.SubscriptionPlan.validateDescription(updateData.description)) {
            throw new Error('Invalid description: must be 1-500 characters');
        }
        if (updateData.features && !SubscriptionPlan_1.SubscriptionPlan.validateFeatures(updateData.features)) {
            throw new Error('Invalid features: maximum 20 features, each 1-200 characters');
        }
        const updatedPlan = await this.subscriptionPlan.update(planId, updateData);
        if (!updatedPlan) {
            throw new Error('Failed to update subscription plan');
        }
        return this.enrichPlanWithStats(updatedPlan);
    }
    async getPlan(planId) {
        const plan = await this.subscriptionPlan.findById(planId);
        if (!plan) {
            return null;
        }
        return this.enrichPlanWithStats(plan);
    }
    async getPlans(creatorId) {
        let plans;
        if (creatorId) {
            plans = await this.subscriptionPlan.findByCreatorId(creatorId);
        }
        else {
            const { plans: allPlans } = await this.subscriptionPlan.findMany({ is_active: true });
            plans = allPlans;
        }
        return Promise.all(plans.map(plan => this.enrichPlanWithStats(plan)));
    }
    async deactivatePlan(planId, creatorId) {
        const existingPlan = await this.subscriptionPlan.findById(planId);
        if (!existingPlan) {
            throw new Error('Subscription plan not found');
        }
        if (creatorId && existingPlan.creator_id !== creatorId) {
            throw new Error('Unauthorized: You can only deactivate your own subscription plans');
        }
        await this.subscriptionPlan.deactivate(planId);
    }
    // Subscription Management
    async createSubscription(request) {
        // Validate plan exists and is active
        const plan = await this.subscriptionPlan.findById(request.planId);
        if (!plan || !plan.is_active) {
            throw new Error('Subscription plan not found or inactive');
        }
        // Validate user exists
        const user = await this.user.findById(request.userId);
        if (!user) {
            throw new Error('User not found');
        }
        // Check if user already has active subscription for this plan
        const hasActiveSubscription = await this.subscription.hasActiveSubscription(request.userId, request.planId);
        if (hasActiveSubscription) {
            throw new Error('User already has an active subscription for this plan');
        }
        // Create or retrieve Stripe customer
        let customer = await this.findOrCreateStripeCustomer(user);
        // Create Stripe checkout session
        const sessionParams = {
            customer: customer.id,
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{
                    price: plan.stripe_price_id,
                    quantity: 1
                }],
            success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/subscription/canceled`,
            metadata: {
                user_id: request.userId,
                plan_id: request.planId
            }
        };
        if (request.trialDays && request.trialDays > 0) {
            sessionParams.subscription_data = {
                trial_period_days: request.trialDays
            };
        }
        if (request.couponCode) {
            // Validate coupon exists in Stripe
            try {
                await this.stripe.coupons.retrieve(request.couponCode);
                sessionParams.discounts = [{ coupon: request.couponCode }];
            }
            catch (error) {
                throw new Error('Invalid coupon code');
            }
        }
        const session = await this.stripe.checkout.sessions.create(sessionParams);
        return {
            id: session.id,
            url: session.url,
            customer_email: user.email
        };
    }
    async getSubscription(subscriptionId, userId) {
        const { subscriptions } = await this.subscription.findManyWithPlan({
            subscriber_id: userId,
            limit: 1
        });
        const subscription = subscriptions.find(sub => sub.id === subscriptionId);
        return subscription || null;
    }
    async getUserSubscriptions(userId) {
        const { subscriptions } = await this.subscription.findManyWithPlan({
            subscriber_id: userId
        });
        return subscriptions;
    }
    async getActiveUserSubscriptions(userId) {
        const { subscriptions } = await this.subscription.findManyWithPlan({
            subscriber_id: userId,
            status: 'active'
        });
        return subscriptions;
    }
    async cancelSubscription(subscriptionId, userId) {
        // Verify subscription exists and user has permission
        const existingSubscription = await this.subscription.findById(subscriptionId);
        if (!existingSubscription) {
            throw new Error('Subscription not found');
        }
        if (userId && existingSubscription.subscriber_id !== userId) {
            throw new Error('Unauthorized: You can only cancel your own subscriptions');
        }
        if (existingSubscription.status === 'canceled') {
            throw new Error('Subscription is already canceled');
        }
        // Cancel in Stripe
        if (existingSubscription.stripe_subscription_id) {
            await this.stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
                cancel_at_period_end: true
            });
        }
        // Update in database
        const canceledSubscription = await this.subscription.cancel(subscriptionId);
        if (!canceledSubscription) {
            throw new Error('Failed to cancel subscription');
        }
        return canceledSubscription;
    }
    async reactivateSubscription(subscriptionId, userId) {
        const existingSubscription = await this.subscription.findById(subscriptionId);
        if (!existingSubscription) {
            throw new Error('Subscription not found');
        }
        if (userId && existingSubscription.subscriber_id !== userId) {
            throw new Error('Unauthorized: You can only reactivate your own subscriptions');
        }
        if (existingSubscription.status !== 'canceled') {
            throw new Error('Only canceled subscriptions can be reactivated');
        }
        // Reactivate in Stripe
        if (existingSubscription.stripe_subscription_id) {
            await this.stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
                cancel_at_period_end: false
            });
        }
        // Update in database
        const reactivatedSubscription = await this.subscription.activate(subscriptionId);
        if (!reactivatedSubscription) {
            throw new Error('Failed to reactivate subscription');
        }
        return reactivatedSubscription;
    }
    // Billing and Customer Portal
    async createBillingPortalSession(userId, returnUrl) {
        const user = await this.user.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        const customer = await this.findOrCreateStripeCustomer(user);
        const session = await this.stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: returnUrl || `${process.env.FRONTEND_URL}/dashboard`
        });
        return {
            url: session.url,
            return_url: returnUrl
        };
    }
    // Analytics and Reporting
    async getSubscriptionStats(creatorId) {
        let whereClause = '';
        const values = [];
        if (creatorId) {
            whereClause = `
        WHERE s.plan_id IN (
          SELECT id FROM subscription_plans WHERE creator_id = $1
        )
      `;
            values.push(creatorId);
        }
        const query = `
      SELECT
        COUNT(*) as total_subscriptions,
        COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_subscriptions,
        COUNT(CASE WHEN s.status = 'canceled' THEN 1 END) as canceled_subscriptions,
        COALESCE(SUM(CASE WHEN s.status = 'active' THEN sp.price ELSE 0 END), 0) as monthly_revenue
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      ${whereClause}
    `;
        const result = await this.pool.query(query, values);
        const stats = result.rows[0];
        // Calculate churn rate
        const churnRate = await this.subscription.getChurnRate(30);
        // Calculate ARPU
        const averageRevenuePerUser = stats.active_subscriptions > 0
            ? Math.round(stats.monthly_revenue / stats.active_subscriptions)
            : 0;
        return {
            totalSubscriptions: parseInt(stats.total_subscriptions),
            activeSubscriptions: parseInt(stats.active_subscriptions),
            canceledSubscriptions: parseInt(stats.canceled_subscriptions),
            monthlyRevenue: parseInt(stats.monthly_revenue),
            churnRate: churnRate,
            averageRevenuePerUser: averageRevenuePerUser
        };
    }
    // Webhook Handling
    async handleStripeWebhook(event) {
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            default:
                console.log(`Unhandled webhook event type: ${event.type}`);
        }
    }
    // Private helper methods
    async findOrCreateStripeCustomer(user) {
        // Try to find existing customer
        const existingCustomers = await this.stripe.customers.list({
            email: user.email,
            limit: 1
        });
        if (existingCustomers.data.length > 0) {
            return existingCustomers.data[0];
        }
        // Create new customer
        return this.stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: {
                user_id: user.id
            }
        });
    }
    async enrichPlanWithStats(plan) {
        const subscriberCount = await this.subscriptionPlan.getSubscriberCount(plan.id);
        const monthlyRevenue = await this.subscriptionPlan.getMonthlyRevenue(plan.id);
        return {
            ...plan,
            subscriberCount,
            monthlyRevenue
        };
    }
    async handleCheckoutCompleted(session) {
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;
        if (!userId || !planId || !session.subscription) {
            console.error('Missing metadata in checkout session');
            return;
        }
        // Create subscription in database
        const subscriptionData = {
            subscriber_id: userId,
            plan_id: planId,
            stripe_subscription_id: session.subscription
        };
        await this.subscription.create(subscriptionData);
    }
    async handlePaymentSucceeded(invoice) {
        if (!invoice.subscription)
            return;
        const subscription = await this.subscription.findByStripeId(invoice.subscription);
        if (!subscription)
            return;
        // Update subscription status to active
        await this.subscription.activate(subscription.id, new Date(invoice.period_start * 1000), new Date(invoice.period_end * 1000));
    }
    async handlePaymentFailed(invoice) {
        if (!invoice.subscription)
            return;
        const subscription = await this.subscription.findByStripeId(invoice.subscription);
        if (!subscription)
            return;
        // Mark subscription as past due
        await this.subscription.setPastDue(subscription.id);
    }
    async handleSubscriptionUpdated(stripeSubscription) {
        const subscription = await this.subscription.findByStripeId(stripeSubscription.id);
        if (!subscription)
            return;
        const updateData = {
            status: this.mapStripeStatusToLocal(stripeSubscription.status),
            current_period_start: new Date(stripeSubscription.current_period_start * 1000),
            current_period_end: new Date(stripeSubscription.current_period_end * 1000)
        };
        await this.subscription.update(subscription.id, updateData);
    }
    async handleSubscriptionDeleted(stripeSubscription) {
        const subscription = await this.subscription.findByStripeId(stripeSubscription.id);
        if (!subscription)
            return;
        await this.subscription.cancel(subscription.id);
    }
    mapStripeStatusToLocal(stripeStatus) {
        switch (stripeStatus) {
            case 'active': return 'active';
            case 'past_due': return 'past_due';
            case 'canceled':
            case 'unpaid': return 'canceled';
            case 'incomplete':
            case 'incomplete_expired': return 'incomplete';
            default: return 'incomplete';
        }
    }
    // Utility methods for access control
    async hasAccess(userId, planId) {
        return this.subscription.hasActiveSubscription(userId, planId);
    }
    async hasAnyActiveSubscription(userId) {
        return this.subscription.hasAnyActiveSubscription(userId);
    }
    async getUserAccessLevel(userId) {
        const hasActive = await this.hasAnyActiveSubscription(userId);
        return hasActive ? 'premium' : 'free';
    }
}
exports.SubscriptionService = SubscriptionService;
//# sourceMappingURL=SubscriptionService.js.map