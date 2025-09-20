import request from 'supertest';
import app from '../../src/index';

describe('POST /api/subscriptions', () => {
  describe('Contract Tests', () => {
    let subscriberToken: string;
    let planId: string;

    beforeAll(async () => {
      // Setup creator and plan
      const creator = {
        email: 'subscreate@example.com',
        password: 'SecurePass123',
        name: 'Subscription Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      // Create a subscription plan
      const planResponse = await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorResponse.body.token}`)
        .send({
          name: 'Test Plan',
          description: 'Test subscription plan',
          price: 999,
          currency: 'USD',
          features: ['Test feature']
        });

      planId = planResponse.body.plan.id;

      // Setup subscriber
      const subscriber = {
        email: 'subscriber@example.com',
        password: 'SecurePass123',
        name: 'Test Subscriber',
        role: 'subscriber'
      };

      const subscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriber);

      subscriberToken = subscriberResponse.body.token;
    });

    it('should create subscription with valid data', async () => {
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa' // Stripe test payment method
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('subscription');

      const { subscription } = response.body;
      expect(subscription).toHaveProperty('id');
      expect(subscription).toHaveProperty('subscriber_id');
      expect(subscription).toHaveProperty('plan_id', planId);
      expect(subscription).toHaveProperty('stripe_subscription_id');
      expect(subscription).toHaveProperty('status');
      expect(subscription).toHaveProperty('current_period_start');
      expect(subscription).toHaveProperty('current_period_end');
      expect(subscription).toHaveProperty('created_at');

      expect(['active', 'incomplete']).toContain(subscription.status);
      expect(typeof subscription.stripe_subscription_id).toBe('string');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa'
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 400 for missing plan_id', async () => {
      const subscriptionData = {
        payment_method_id: 'pm_card_visa'
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for missing payment_method_id', async () => {
      const subscriptionData = {
        plan_id: planId
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for invalid plan_id', async () => {
      const subscriptionData = {
        plan_id: '123e4567-e89b-12d3-a456-426614174000', // Non-existent plan
        payment_method_id: 'pm_card_visa'
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for invalid payment method', async () => {
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_invalid_payment_method'
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should prevent duplicate active subscriptions', async () => {
      // First subscription should succeed
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa'
      };

      await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      // Second subscription to same plan should fail
      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/already.*subscribed/i);
    });
  });
});