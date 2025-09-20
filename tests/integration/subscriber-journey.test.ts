import request from 'supertest';
import app from '../../src/index';

describe('Subscriber Journey Flow', () => {
  describe('Integration Tests', () => {
    let creatorToken: string;
    let planId: string;

    beforeAll(async () => {
      // Setup creator and subscription plan
      const creator = {
        email: 'subscriber.journey.creator@example.com',
        password: 'SecurePass123',
        name: 'Journey Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = creatorResponse.body.token;

      // Create subscription plan
      const planResponse = await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Premium Journey',
          description: 'Premium subscription for journey testing',
          price: 2999,
          currency: 'USD',
          features: ['All articles', 'Newsletter', 'Community access']
        });

      planId = planResponse.body.plan.id;

      // Create some premium content
      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title: 'Premium Content Article',
          content: '<p>This is premium content only for subscribers.</p>',
          is_premium: true
        });
    });

    it('should complete full subscriber registration and subscription workflow', async () => {
      const subscriberData = {
        email: 'subscriber.journey@example.com',
        password: 'SecurePass123',
        name: 'Journey Subscriber',
        role: 'subscriber'
      };

      // Step 1: Register as subscriber
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriberData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.user.role).toBe('subscriber');

      const subscriberToken = registerResponse.body.token;
      const subscriberId = registerResponse.body.user.id;

      // Step 2: Browse available subscription plans
      const plansResponse = await request(app)
        .get('/api/subscription-plans')
        .expect(200);

      expect(plansResponse.body.success).toBe(true);
      expect(plansResponse.body.plans.length).toBeGreaterThan(0);

      const targetPlan = plansResponse.body.plans.find(
        (plan: any) => plan.id === planId
      );
      expect(targetPlan).toBeDefined();

      // Step 3: Create subscription
      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa' // Test payment method
      };

      const subscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      expect(subscriptionResponse.body.success).toBe(true);
      expect(subscriptionResponse.body.subscription.subscriber_id).toBe(subscriberId);
      expect(subscriptionResponse.body.subscription.plan_id).toBe(planId);
      expect(['active', 'incomplete']).toContain(subscriptionResponse.body.subscription.status);

      // Step 4: Verify access to premium content
      const articlesResponse = await request(app)
        .get('/api/articles')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(articlesResponse.body.success).toBe(true);
      // Should now see premium content
      const premiumArticles = articlesResponse.body.articles.filter(
        (article: any) => article.is_premium
      );
      expect(premiumArticles.length).toBeGreaterThan(0);

      // Step 5: Subscribe to newsletter
      const newsletterResponse = await request(app)
        .post('/api/newsletter/subscribe')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send({
          preferences: {
            weekly_digest: true,
            new_articles: true,
            special_offers: false
          }
        })
        .expect(201);

      expect(newsletterResponse.body.success).toBe(true);

      // Step 6: Verify subscriber profile
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(profileResponse.body.user.email).toBe(subscriberData.email);
      expect(profileResponse.body.user.role).toBe('subscriber');
    });

    it('should handle subscription failures gracefully', async () => {
      const subscriberData = {
        email: 'failed.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Failed Subscriber',
        role: 'subscriber'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriberData)
        .expect(201);

      const subscriberToken = registerResponse.body.token;

      // Test with invalid payment method
      const invalidSubscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_chargeDeclined'
      };

      const failedSubscriptionResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(invalidSubscriptionData)
        .expect(400);

      expect(failedSubscriptionResponse.body.success).toBe(false);

      // Verify no access to premium content without subscription
      const articlesResponse = await request(app)
        .get('/api/articles')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      // Should not see premium content details
      const articles = articlesResponse.body.articles;
      const premiumArticle = articles.find((article: any) => article.is_premium);
      if (premiumArticle) {
        expect(premiumArticle.content).toBeUndefined();
      }
    });

    it('should prevent duplicate subscriptions to same plan', async () => {
      const subscriberData = {
        email: 'duplicate.sub@example.com',
        password: 'SecurePass123',
        name: 'Duplicate Subscriber',
        role: 'subscriber'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriberData)
        .expect(201);

      const subscriberToken = registerResponse.body.token;

      const subscriptionData = {
        plan_id: planId,
        payment_method_id: 'pm_card_visa'
      };

      // First subscription should succeed
      await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      // Second subscription to same plan should fail
      await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(400);
    });
  });
});