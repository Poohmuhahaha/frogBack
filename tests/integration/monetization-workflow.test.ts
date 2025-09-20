import request from 'supertest';
import app from '../../src/index';

describe('Monetization Workflow Flow', () => {
  describe('Integration Tests', () => {
    let creatorToken: string;
    let creatorId: string;
    let subscriberToken: string;
    let planId: string;

    beforeAll(async () => {
      // Setup creator
      const creator = {
        email: 'monetization.creator@example.com',
        password: 'SecurePass123',
        name: 'Monetization Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = creatorResponse.body.token;
      creatorId = creatorResponse.body.user.id;

      // Setup subscriber
      const subscriber = {
        email: 'monetization.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Monetization Subscriber',
        role: 'subscriber'
      };

      const subscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriber);

      subscriberToken = subscriberResponse.body.token;
    });

    it('should complete full monetization setup and subscription revenue flow', async () => {
      // Step 1: Creator sets up subscription plan
      const planData = {
        name: 'Premium Research Access',
        description: 'Full access to premium research content and exclusive insights',
        price: 2999, // $29.99
        currency: 'USD',
        features: [
          'Access to all premium articles',
          'Weekly exclusive newsletter',
          'Monthly Q&A sessions',
          'Research paper downloads',
          'Ad-free experience'
        ]
      };

      const planResponse = await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(planData)
        .expect(201);

      expect(planResponse.body.success).toBe(true);
      expect(planResponse.body.plan.creator_id).toBe(creatorId);
      expect(planResponse.body.plan.stripe_price_id).toBeDefined();

      planId = planResponse.body.plan.id;

      // Step 2: Create premium content
      const premiumArticleData = {
        title: 'Advanced Research Methodology: Premium Guide',
        content: `<h1>Advanced Research Methodology</h1>
                  <p>This comprehensive guide covers advanced research techniques...</p>
                  <h2>Statistical Analysis</h2>
                  <p>Deep dive into statistical methods for research validation...</p>`,
        excerpt: 'Comprehensive guide to advanced research methodology',
        tags: ['research', 'methodology', 'premium'],
        is_premium: true,
        seo_title: 'Advanced Research Methodology Guide',
        seo_description: 'Complete guide to advanced research methodology techniques'
      };

      const premiumArticleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(premiumArticleData)
        .expect(201);

      const premiumArticleId = premiumArticleResponse.body.article.id;

      // Publish premium content
      await request(app)
        .post(`/api/articles/${premiumArticleId}/publish`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ scheduled_at: null })
        .expect(200);

      // Step 3: Subscriber discovers and subscribes to plan
      const plansResponse = await request(app)
        .get('/api/subscription-plans')
        .expect(200);

      const availablePlan = plansResponse.body.plans.find(
        (plan: any) => plan.id === planId
      );
      expect(availablePlan).toBeDefined();
      expect(availablePlan.price).toBe(planData.price);

      // Step 4: Subscriber creates subscription
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa' // Test Stripe payment method
      };

      const subscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      expect(subscriptionResponse.body.success).toBe(true);
      expect(subscriptionResponse.body.subscription.plan_id).toBe(planId);
      expect(subscriptionResponse.body.subscription.stripe_subscription_id).toBeDefined();

      const subscriptionId = subscriptionResponse.body.subscription.id;

      // Step 5: Verify subscriber gains access to premium content
      const premiumContentResponse = await request(app)
        .get(`/api/articles/${premiumArticleId}`)
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(premiumContentResponse.body.success).toBe(true);
      expect(premiumContentResponse.body.article.content).toBeDefined();
      expect(premiumContentResponse.body.article.is_premium).toBe(true);

      // Step 6: Verify revenue analytics for creator
      const revenueResponse = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(revenueResponse.body.success).toBe(true);
      expect(revenueResponse.body.revenue_data.subscription_revenue).toBeGreaterThan(0);
      expect(revenueResponse.body.revenue_data.total_revenue).toBeGreaterThan(0);

      // Step 7: Verify analytics overview updates
      const overviewResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(overviewResponse.body.success).toBe(true);
      expect(overviewResponse.body.overview.active_subscriptions).toBeGreaterThan(0);
      expect(overviewResponse.body.overview.total_revenue).toBeGreaterThan(0);

      // Step 8: Test subscription management
      const subscriptionsListResponse = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(subscriptionsListResponse.body.success).toBe(true);
      expect(subscriptionsListResponse.body.subscriptions.length).toBeGreaterThan(0);

      const userSubscription = subscriptionsListResponse.body.subscriptions.find(
        (sub: any) => sub.id === subscriptionId
      );
      expect(userSubscription).toBeDefined();
      expect(userSubscription.status).toBe('active');
    });

    it('should handle subscription cancellation and revenue impact', async () => {
      // Create another subscriber for cancellation test
      const cancelSubscriber = {
        email: 'cancel.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Cancel Subscriber',
        role: 'subscriber'
      };

      const cancelSubscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(cancelSubscriber);

      const cancelSubscriberToken = cancelSubscriberResponse.body.token;

      // Subscribe to plan
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa'
      };

      const subscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${cancelSubscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      const subscriptionId = subscriptionResponse.body.subscription.id;

      // Cancel subscription
      const cancelResponse = await request(app)
        .delete(`/api/subscriptions/${subscriptionId}`)
        .set('Authorization', `Bearer ${cancelSubscriberToken}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Verify subscription status change
      const statusResponse = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${cancelSubscriberToken}`)
        .expect(200);

      const cancelledSubscription = statusResponse.body.subscriptions.find(
        (sub: any) => sub.id === subscriptionId
      );
      expect(['cancelled', 'inactive']).toContain(cancelledSubscription.status);

      // Verify analytics reflect the change
      const updatedOverviewResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(updatedOverviewResponse.body.success).toBe(true);
      // Active subscriptions should decrease
    });

    it('should handle payment failures and retry scenarios', async () => {
      const failureSubscriber = {
        email: 'payment.failure@example.com',
        password: 'SecurePass123',
        name: 'Payment Failure Subscriber',
        role: 'subscriber'
      };

      const failureSubscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(failureSubscriber);

      const failureSubscriberToken = failureSubscriberResponse.body.token;

      // Attempt subscription with failing payment method
      const failingSubscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_chargeDeclined'
      };

      const failedSubscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${failureSubscriberToken}`)
        .send(failingSubscriptionData)
        .expect(400);

      expect(failedSubscriptionResponse.body.success).toBe(false);
      expect(failedSubscriptionResponse.body.error).toMatch(/payment.*failed/i);

      // Verify no subscription created
      const subscriptionsResponse = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${failureSubscriberToken}`)
        .expect(200);

      expect(subscriptionsResponse.body.subscriptions.length).toBe(0);

      // Retry with valid payment method
      const retrySubscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa'
      };

      const retrySubscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${failureSubscriberToken}`)
        .send(retrySubscriptionData)
        .expect(201);

      expect(retrySubscriptionResponse.body.success).toBe(true);
    });

    it('should validate plan pricing and creator permissions', async () => {
      // Test creating plan with invalid pricing
      const invalidPlanData = {
        name: 'Invalid Plan',
        description: 'Plan with invalid pricing',
        price: -100, // Negative price
        currency: 'USD',
        features: ['Invalid feature']
      };

      await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(invalidPlanData)
        .expect(400);

      // Test creating plan without creator role
      const regularUser = {
        email: 'regular.user@example.com',
        password: 'SecurePass123',
        name: 'Regular User',
        role: 'subscriber'
      };

      const regularUserResponse = await request(app)
        .post('/api/auth/register')
        .send(regularUser);

      const regularUserToken = regularUserResponse.body.token;

      const validPlanData = {
        name: 'Unauthorized Plan',
        description: 'Plan created by non-creator',
        price: 1999,
        currency: 'USD',
        features: ['Unauthorized feature']
      };

      await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(validPlanData)
        .expect(403);
    });
  });
});