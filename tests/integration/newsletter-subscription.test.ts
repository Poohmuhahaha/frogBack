import request from 'supertest';
import app from '../../src/index';

describe('Newsletter Subscription Flow', () => {
  describe('Integration Tests', () => {
    let creatorToken: string;
    let subscriberToken: string;
    let guestEmail: string;

    beforeAll(async () => {
      // Setup creator
      const creator = {
        email: 'newsletter.creator@example.com',
        password: 'SecurePass123',
        name: 'Newsletter Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = creatorResponse.body.token;

      // Setup subscriber
      const subscriber = {
        email: 'newsletter.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Newsletter Subscriber',
        role: 'subscriber'
      };

      const subscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriber);

      subscriberToken = subscriberResponse.body.token;

      guestEmail = 'newsletter.guest@example.com';

      // Create some content for newsletter
      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title: 'Newsletter Article 1',
          content: '<p>First article for newsletter.</p>',
          tags: ['newsletter-content']
        });

      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title: 'Newsletter Article 2',
          content: '<p>Second article for newsletter.</p>',
          tags: ['newsletter-content']
        });
    });

    it('should complete full newsletter subscription workflow for authenticated users', async () => {
      // Step 1: Subscribe to newsletter with preferences
      const subscriptionData = {
        preferences: {
          weekly_digest: true,
          new_articles: true,
          special_offers: false,
          product_updates: true
        }
      };

      const subscribeResponse = await request(app)
        .post('/api/newsletter/subscribe')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      expect(subscribeResponse.body.success).toBe(true);
      expect(subscribeResponse.body.subscription).toBeDefined();
      expect(subscribeResponse.body.subscription.preferences).toEqual(subscriptionData.preferences);

      // Step 2: Verify subscription status
      const statusResponse = await request(app)
        .get('/api/newsletter/subscription')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.subscription.is_subscribed).toBe(true);
      expect(statusResponse.body.subscription.preferences).toEqual(subscriptionData.preferences);

      // Step 3: Update subscription preferences
      const updatedPreferences = {
        preferences: {
          weekly_digest: false,
          new_articles: true,
          special_offers: true,
          product_updates: false
        }
      };

      const updateResponse = await request(app)
        .put('/api/newsletter/subscription')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(updatedPreferences)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.subscription.preferences).toEqual(updatedPreferences.preferences);

      // Step 4: Verify analytics update for creator
      const analyticsResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.overview.newsletter_subscribers).toBeGreaterThan(0);

      // Step 5: Unsubscribe from newsletter
      const unsubscribeResponse = await request(app)
        .delete('/api/newsletter/subscription')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(unsubscribeResponse.body.success).toBe(true);

      // Step 6: Verify unsubscription
      const finalStatusResponse = await request(app)
        .get('/api/newsletter/subscription')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      expect(finalStatusResponse.body.success).toBe(true);
      expect(finalStatusResponse.body.subscription.is_subscribed).toBe(false);
    });

    it('should handle guest newsletter subscription workflow', async () => {
      // Step 1: Guest subscription with email only
      const guestSubscriptionData = {
        email: guestEmail,
        preferences: {
          weekly_digest: true,
          new_articles: false,
          special_offers: false,
          product_updates: false
        }
      };

      const guestSubscribeResponse = await request(app)
        .post('/api/newsletter/subscribe')
        .send(guestSubscriptionData)
        .expect(201);

      expect(guestSubscribeResponse.body.success).toBe(true);
      expect(guestSubscribeResponse.body.subscription.email).toBe(guestEmail);

      // Step 2: Verify subscription with token (simulated email confirmation)
      const subscriptionToken = guestSubscribeResponse.body.subscription.confirmation_token;
      expect(subscriptionToken).toBeDefined();

      const confirmResponse = await request(app)
        .post('/api/newsletter/confirm')
        .send({ token: subscriptionToken })
        .expect(200);

      expect(confirmResponse.body.success).toBe(true);

      // Step 3: Guest unsubscribe using token
      const unsubscribeToken = confirmResponse.body.unsubscribe_token;
      const guestUnsubscribeResponse = await request(app)
        .post('/api/newsletter/unsubscribe')
        .send({ token: unsubscribeToken })
        .expect(200);

      expect(guestUnsubscribeResponse.body.success).toBe(true);
    });

    it('should prevent duplicate subscriptions', async () => {
      // First subscription should succeed
      const subscriptionData = {
        preferences: {
          weekly_digest: true,
          new_articles: true,
          special_offers: false,
          product_updates: true
        }
      };

      await request(app)
        .post('/api/newsletter/subscribe')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(subscriptionData)
        .expect(201);

      // Second subscription should update preferences, not create duplicate
      const updatedSubscriptionData = {
        preferences: {
          weekly_digest: false,
          new_articles: true,
          special_offers: true,
          product_updates: false
        }
      };

      const duplicateResponse = await request(app)
        .post('/api/newsletter/subscribe')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send(updatedSubscriptionData)
        .expect(200); // Should be 200 (update) not 201 (create)

      expect(duplicateResponse.body.success).toBe(true);
      expect(duplicateResponse.body.subscription.preferences).toEqual(
        updatedSubscriptionData.preferences
      );
    });

    it('should validate email format for guest subscriptions', async () => {
      // Test invalid email format
      const invalidEmailData = {
        email: 'invalid-email-format',
        preferences: {
          weekly_digest: true,
          new_articles: false,
          special_offers: false,
          product_updates: false
        }
      };

      await request(app)
        .post('/api/newsletter/subscribe')
        .send(invalidEmailData)
        .expect(400);

      // Test missing email
      const missingEmailData = {
        preferences: {
          weekly_digest: true,
          new_articles: false,
          special_offers: false,
          product_updates: false
        }
      };

      await request(app)
        .post('/api/newsletter/subscribe')
        .send(missingEmailData)
        .expect(400);
    });

    it('should handle invalid confirmation and unsubscribe tokens', async () => {
      // Test invalid confirmation token
      await request(app)
        .post('/api/newsletter/confirm')
        .send({ token: 'invalid-token' })
        .expect(400);

      // Test expired/invalid unsubscribe token
      await request(app)
        .post('/api/newsletter/unsubscribe')
        .send({ token: 'expired-token' })
        .expect(400);

      // Test missing tokens
      await request(app)
        .post('/api/newsletter/confirm')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/newsletter/unsubscribe')
        .send({})
        .expect(400);
    });

    it('should require authentication for subscription management endpoints', async () => {
      // Test accessing subscription status without authentication
      await request(app)
        .get('/api/newsletter/subscription')
        .expect(401);

      // Test updating preferences without authentication
      await request(app)
        .put('/api/newsletter/subscription')
        .send({
          preferences: {
            weekly_digest: true,
            new_articles: false,
            special_offers: false,
            product_updates: false
          }
        })
        .expect(401);

      // Test unsubscribing without authentication
      await request(app)
        .delete('/api/newsletter/subscription')
        .expect(401);
    });
  });
});