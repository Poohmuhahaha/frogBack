import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SubscriptionService } from '../../../src/services/SubscriptionService';
import database from '../../../src/database/connection';
import stripeIntegration from '../../../src/integrations/stripe';

jest.mock('../../../src/database/connection');
jest.mock('../../../src/integrations/stripe');

const mockDatabase = database as jest.Mocked<typeof database>;
const mockStripe = stripeIntegration as jest.Mocked<typeof stripeIntegration>;

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    subscriptionService = new SubscriptionService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getSubscriptionPlans', () => {
    const mockPlans = [
      {
        id: 'plan_1',
        name: 'Basic Plan',
        description: 'Basic subscription',
        price: 999,
        currency: 'USD',
        interval: 'month',
        stripe_price_id: 'price_basic',
        features: ['feature1', 'feature2'],
        active: true
      },
      {
        id: 'plan_2',
        name: 'Premium Plan',
        description: 'Premium subscription',
        price: 1999,
        currency: 'USD',
        interval: 'month',
        stripe_price_id: 'price_premium',
        features: ['feature1', 'feature2', 'feature3'],
        active: true
      }
    ];

    it('should successfully retrieve all active subscription plans', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: mockPlans });

      const result = await subscriptionService.getSubscriptionPlans();

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM subscription_plans WHERE active = true'),
        []
      );
      expect(result).toEqual(mockPlans);
    });

    it('should return empty array when no plans exist', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.getSubscriptionPlans();

      expect(result).toEqual([]);
    });
  });

  describe('createSubscription', () => {
    const subscriptionData = {
      userId: 'user_123',
      planId: 'plan_1',
      paymentMethodId: 'pm_test_123'
    };

    const mockUser = {
      id: 'user_123',
      email: 'user@example.com',
      stripe_customer_id: 'cus_test_123'
    };

    const mockPlan = {
      id: 'plan_1',
      name: 'Basic Plan',
      stripe_price_id: 'price_basic',
      price: 999
    };

    const mockStripeSubscription = {
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      current_period_start: 1640995200,
      current_period_end: 1643673600,
      items: {
        data: [{ price: { id: 'price_basic' } }]
      }
    };

    it('should successfully create a new subscription', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [mockPlan] }) // Get plan
        .mockResolvedValueOnce({ rows: [] }); // Check existing subscription

      mockStripe.createSubscription.mockResolvedValueOnce(mockStripeSubscription as any);

      const result = await subscriptionService.createSubscription(subscriptionData);

      expect(mockStripe.createSubscription).toHaveBeenCalledWith({
        customerId: mockUser.stripe_customer_id,
        priceId: mockPlan.stripe_price_id,
        metadata: {
          userId: subscriptionData.userId,
          planId: subscriptionData.planId
        }
      });
      expect(result).toEqual(mockStripeSubscription);
    });

    it('should create Stripe customer if user does not have one', async () => {
      const userWithoutStripe = { ...mockUser, stripe_customer_id: null };
      const mockCustomer = { id: 'cus_new_123', email: mockUser.email };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [userWithoutStripe] })
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce({ rows: [] });

      mockStripe.createCustomer.mockResolvedValueOnce(mockCustomer as any);
      mockStripe.createSubscription.mockResolvedValueOnce(mockStripeSubscription as any);

      await subscriptionService.createSubscription(subscriptionData);

      expect(mockStripe.createCustomer).toHaveBeenCalledWith({
        email: mockUser.email,
        metadata: { userId: mockUser.id }
      });
    });

    it('should throw error if user not found', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionService.createSubscription(subscriptionData)).rejects.toThrow('User not found');
    });

    it('should throw error if plan not found', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionService.createSubscription(subscriptionData)).rejects.toThrow('Subscription plan not found');
    });

    it('should throw error if user already has active subscription', async () => {
      const existingSubscription = { id: 'sub_existing', status: 'active' };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce({ rows: [existingSubscription] });

      await expect(subscriptionService.createSubscription(subscriptionData)).rejects.toThrow('User already has an active subscription');
    });
  });

  describe('cancelSubscription', () => {
    const subscriptionId = 'sub_test_123';
    const immediately = false;

    const mockSubscription = {
      id: subscriptionId,
      user_id: 'user_123',
      stripe_subscription_id: subscriptionId,
      status: 'active'
    };

    const mockCancelledSubscription = {
      ...mockSubscription,
      status: 'canceled',
      cancel_at_period_end: true
    };

    it('should successfully cancel subscription at period end', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockSubscription] });
      mockStripe.cancelSubscription.mockResolvedValueOnce(mockCancelledSubscription as any);

      const result = await subscriptionService.cancelSubscription(subscriptionId, immediately);

      expect(mockStripe.cancelSubscription).toHaveBeenCalledWith(subscriptionId, immediately);
      expect(result).toEqual(mockCancelledSubscription);
    });

    it('should successfully cancel subscription immediately', async () => {
      const immediateCancel = true;
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockSubscription] });
      mockStripe.cancelSubscription.mockResolvedValueOnce(mockCancelledSubscription as any);

      await subscriptionService.cancelSubscription(subscriptionId, immediateCancel);

      expect(mockStripe.cancelSubscription).toHaveBeenCalledWith(subscriptionId, immediateCancel);
    });

    it('should throw error if subscription not found', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionService.cancelSubscription(subscriptionId)).rejects.toThrow('Subscription not found');
    });

    it('should throw error if subscription already cancelled', async () => {
      const cancelledSubscription = { ...mockSubscription, status: 'canceled' };
      mockDatabase.query.mockResolvedValueOnce({ rows: [cancelledSubscription] });

      await expect(subscriptionService.cancelSubscription(subscriptionId)).rejects.toThrow('Subscription is already cancelled');
    });
  });

  describe('getUserSubscription', () => {
    const userId = 'user_123';

    const mockSubscription = {
      id: 'sub_test_123',
      user_id: userId,
      plan_name: 'Basic Plan',
      status: 'active',
      current_period_start: new Date(),
      current_period_end: new Date(),
      created_at: new Date()
    };

    it('should successfully retrieve user subscription', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await subscriptionService.getUserSubscription(userId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*, p.name as plan_name'),
        [userId]
      );
      expect(result).toEqual(mockSubscription);
    });

    it('should return null if user has no subscription', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.getUserSubscription(userId);

      expect(result).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    const subscriptionId = 'sub_test_123';
    const newPlanId = 'plan_2';

    const mockSubscription = {
      id: subscriptionId,
      stripe_subscription_id: subscriptionId,
      status: 'active'
    };

    const mockNewPlan = {
      id: newPlanId,
      stripe_price_id: 'price_premium'
    };

    const mockUpdatedSubscription = {
      ...mockSubscription,
      plan_id: newPlanId
    };

    it('should successfully update subscription plan', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Get subscription
        .mockResolvedValueOnce({ rows: [mockNewPlan] }); // Get new plan

      mockStripe.updateSubscription.mockResolvedValueOnce(mockUpdatedSubscription as any);

      const result = await subscriptionService.updateSubscription(subscriptionId, { planId: newPlanId });

      expect(mockStripe.updateSubscription).toHaveBeenCalledWith(subscriptionId, {
        items: [{ price: mockNewPlan.stripe_price_id }],
        proration_behavior: 'create_prorations'
      });
      expect(result).toEqual(mockUpdatedSubscription);
    });

    it('should throw error if subscription not found', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionService.updateSubscription(subscriptionId, { planId: newPlanId })).rejects.toThrow('Subscription not found');
    });

    it('should throw error if new plan not found', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockSubscription] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionService.updateSubscription(subscriptionId, { planId: newPlanId })).rejects.toThrow('Subscription plan not found');
    });
  });

  describe('getSubscriptionAnalytics', () => {
    const mockAnalytics = {
      total_subscriptions: 100,
      active_subscriptions: 85,
      cancelled_subscriptions: 15,
      monthly_revenue: 8500,
      churn_rate: 0.05,
      growth_rate: 0.12
    };

    it('should successfully retrieve subscription analytics', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockAnalytics] });

      const result = await subscriptionService.getSubscriptionAnalytics();

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        []
      );
      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('getUpcomingInvoices', () => {
    const customerId = 'cus_test_123';
    const mockInvoices = [
      {
        id: 'in_test_1',
        amount_due: 999,
        currency: 'usd',
        period_start: 1640995200,
        period_end: 1643673600
      }
    ];

    it('should successfully retrieve upcoming invoices', async () => {
      mockStripe.getInvoices.mockResolvedValueOnce(mockInvoices as any);

      const result = await subscriptionService.getUpcomingInvoices(customerId);

      expect(mockStripe.getInvoices).toHaveBeenCalledWith(customerId, 10);
      expect(result).toEqual(mockInvoices);
    });
  });

  describe('handleSubscriptionWebhook', () => {
    const webhookData = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: 1640995200,
          current_period_end: 1643673600
        }
      }
    };

    it('should successfully handle subscription webhook', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Update subscription

      await subscriptionService.handleSubscriptionWebhook(webhookData);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE subscriptions'),
        expect.any(Array)
      );
    });

    it('should handle unknown webhook types gracefully', async () => {
      const unknownWebhook = {
        ...webhookData,
        type: 'unknown.event'
      };

      await expect(subscriptionService.handleSubscriptionWebhook(unknownWebhook)).resolves.not.toThrow();
    });
  });

  describe('calculateProration', () => {
    const subscriptionData = {
      currentPlanPrice: 999,
      newPlanPrice: 1999,
      daysRemaining: 15,
      totalDaysInPeriod: 30
    };

    it('should correctly calculate proration amount', async () => {
      const result = await subscriptionService.calculateProration(subscriptionData);

      const expectedProration = Math.round(
        ((subscriptionData.newPlanPrice - subscriptionData.currentPlanPrice) *
        subscriptionData.daysRemaining) / subscriptionData.totalDaysInPeriod
      );

      expect(result).toEqual({
        proratedAmount: expectedProration,
        refundAmount: 0,
        additionalAmount: expectedProration
      });
    });

    it('should handle downgrade with refund', async () => {
      const downgradeData = {
        ...subscriptionData,
        newPlanPrice: 499
      };

      const result = await subscriptionService.calculateProration(downgradeData);

      expect(result.additionalAmount).toBe(0);
      expect(result.refundAmount).toBeGreaterThan(0);
    });
  });

  describe('getSubscriptionHistory', () => {
    const userId = 'user_123';
    const mockHistory = [
      {
        id: 'sub_1',
        plan_name: 'Basic Plan',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'sub_2',
        plan_name: 'Premium Plan',
        status: 'canceled',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    it('should successfully retrieve subscription history', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: mockHistory });

      const result = await subscriptionService.getSubscriptionHistory(userId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*, p.name as plan_name'),
        [userId]
      );
      expect(result).toEqual(mockHistory);
    });
  });

  describe('validateSubscriptionAccess', () => {
    const userId = 'user_123';
    const resourceType = 'premium_content';

    it('should return true for user with active subscription', async () => {
      const activeSubscription = {
        status: 'active',
        current_period_end: new Date(Date.now() + 86400000) // 1 day from now
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [activeSubscription] });

      const result = await subscriptionService.validateSubscriptionAccess(userId, resourceType);

      expect(result).toBe(true);
    });

    it('should return false for user without active subscription', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.validateSubscriptionAccess(userId, resourceType);

      expect(result).toBe(false);
    });

    it('should return false for expired subscription', async () => {
      const expiredSubscription = {
        status: 'active',
        current_period_end: new Date(Date.now() - 86400000) // 1 day ago
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [expiredSubscription] });

      const result = await subscriptionService.validateSubscriptionAccess(userId, resourceType);

      expect(result).toBe(false);
    });
  });
});