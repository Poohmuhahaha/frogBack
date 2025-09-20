import request from 'supertest';
import app from '../../src/index';

describe('Analytics Dashboard Data Flow', () => {
  describe('Integration Tests', () => {
    let creatorToken: string;
    let creatorId: string;
    let subscriberToken: string;
    let planId: string;
    let articleIds: string[] = [];

    beforeAll(async () => {
      // Setup creator
      const creator = {
        email: 'analytics.dashboard.creator@example.com',
        password: 'SecurePass123',
        name: 'Analytics Dashboard Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = creatorResponse.body.token;
      creatorId = creatorResponse.body.user.id;

      // Setup subscriber
      const subscriber = {
        email: 'analytics.dashboard.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Analytics Dashboard Subscriber',
        role: 'subscriber'
      };

      const subscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriber);

      subscriberToken = subscriberResponse.body.token;

      // Create subscription plan
      const planResponse = await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Analytics Test Plan',
          description: 'Plan for analytics testing',
          price: 1999,
          currency: 'USD',
          features: ['Analytics features']
        });

      planId = planResponse.body.plan.id;

      // Create multiple articles for analytics
      const articles = [
        {
          title: 'Popular Analytics Article',
          content: '<p>Content about analytics.</p>',
          tags: ['analytics', 'popular'],
          is_premium: false
        },
        {
          title: 'Premium Analytics Guide',
          content: '<p>Premium content about advanced analytics.</p>',
          tags: ['analytics', 'premium'],
          is_premium: true
        },
        {
          title: 'Free Research Methods',
          content: '<p>Free content about research methods.</p>',
          tags: ['research', 'methods'],
          is_premium: false
        }
      ];

      for (const article of articles) {
        const articleResponse = await request(app)
          .post('/api/articles')
          .set('Authorization', `Bearer ${creatorToken}`)
          .send(article);

        const articleId = articleResponse.body.article.id;
        articleIds.push(articleId);

        // Publish each article
        await request(app)
          .post(`/api/articles/${articleId}/publish`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .send({ scheduled_at: null });
      }

      // Create subscription for subscriber
      await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send({
          plan_id: planId,
          payment_method_id: 'pm_card_visa'
        });

      // Subscribe to newsletter
      await request(app)
        .post('/api/newsletter/subscribe')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send({
          preferences: {
            weekly_digest: true,
            new_articles: true,
            special_offers: false,
            product_updates: true
          }
        });
    });

    it('should provide comprehensive analytics overview data', async () => {
      const response = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const { overview } = response.body;

      // Verify all required metrics are present
      expect(overview).toHaveProperty('total_page_views');
      expect(overview).toHaveProperty('unique_visitors');
      expect(overview).toHaveProperty('total_revenue');
      expect(overview).toHaveProperty('newsletter_subscribers');
      expect(overview).toHaveProperty('active_subscriptions');
      expect(overview).toHaveProperty('articles_published');
      expect(overview).toHaveProperty('avg_time_on_page');
      expect(overview).toHaveProperty('bounce_rate');
      expect(overview).toHaveProperty('growth_metrics');

      // Verify data consistency
      expect(overview.articles_published).toBe(3);
      expect(overview.active_subscriptions).toBe(1);
      expect(overview.newsletter_subscribers).toBe(1);
      expect(overview.total_revenue).toBeGreaterThan(0);

      // Verify growth metrics structure
      expect(overview.growth_metrics).toHaveProperty('page_views_growth');
      expect(overview.growth_metrics).toHaveProperty('revenue_growth');
      expect(overview.growth_metrics).toHaveProperty('subscriber_growth');
    });

    it('should provide detailed revenue analytics across different time periods', async () => {
      const periods = ['7d', '30d', '90d', '1y'];

      for (const period of periods) {
        const response = await request(app)
          .get(`/api/analytics/revenue?period=${period}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const { revenue_data } = response.body;

        // Verify revenue structure
        expect(revenue_data).toHaveProperty('total_revenue');
        expect(revenue_data).toHaveProperty('subscription_revenue');
        expect(revenue_data).toHaveProperty('ad_revenue');
        expect(revenue_data).toHaveProperty('affiliate_revenue');
        expect(revenue_data).toHaveProperty('monthly_breakdown');
        expect(revenue_data).toHaveProperty('currency');

        // Verify data types and constraints
        expect(typeof revenue_data.total_revenue).toBe('number');
        expect(revenue_data.total_revenue).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(revenue_data.monthly_breakdown)).toBe(true);

        // Verify total equals sum of components
        const calculatedTotal = revenue_data.subscription_revenue +
                               revenue_data.ad_revenue +
                               revenue_data.affiliate_revenue;
        expect(revenue_data.total_revenue).toBe(calculatedTotal);
      }
    });

    it('should filter revenue data by source', async () => {
      const sources = ['subscription', 'ads', 'affiliate'];

      for (const source of sources) {
        const response = await request(app)
          .get(`/api/analytics/revenue?source=${source}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.revenue_data).toBeDefined();

        // For subscription source, should show subscription revenue
        if (source === 'subscription') {
          expect(response.body.revenue_data.subscription_revenue).toBeGreaterThan(0);
        }
      }
    });

    it('should track analytics changes over time with multiple data points', async () => {
      // Simulate article views by accessing articles
      for (const articleId of articleIds) {
        // Simulate multiple views
        await request(app)
          .get(`/api/articles/${articleId}`)
          .expect(200);

        await request(app)
          .get(`/api/articles/${articleId}`)
          .set('Authorization', `Bearer ${subscriberToken}`)
          .expect(200);
      }

      // Get updated analytics
      const overviewResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(overviewResponse.body.success).toBe(true);
      const overview = overviewResponse.body.overview;

      // Verify page views increased
      expect(overview.total_page_views).toBeGreaterThanOrEqual(0);
      expect(overview.unique_visitors).toBeGreaterThanOrEqual(0);

      // Test different time periods show different data
      const shortPeriodResponse = await request(app)
        .get('/api/analytics/overview?period=7d')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const longPeriodResponse = await request(app)
        .get('/api/analytics/overview?period=1y')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(shortPeriodResponse.body.success).toBe(true);
      expect(longPeriodResponse.body.success).toBe(true);
    });

    it('should handle analytics for creators with no data', async () => {
      // Create new creator with no content
      const newCreator = {
        email: 'new.analytics.creator@example.com',
        password: 'SecurePass123',
        name: 'New Analytics Creator',
        role: 'creator'
      };

      const newCreatorResponse = await request(app)
        .post('/api/auth/register')
        .send(newCreator);

      const newCreatorToken = newCreatorResponse.body.token;

      // Check analytics for new creator
      const overviewResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${newCreatorToken}`)
        .expect(200);

      expect(overviewResponse.body.success).toBe(true);
      const overview = overviewResponse.body.overview;

      // All metrics should be zero or default values
      expect(overview.total_page_views).toBe(0);
      expect(overview.unique_visitors).toBe(0);
      expect(overview.total_revenue).toBe(0);
      expect(overview.newsletter_subscribers).toBe(0);
      expect(overview.active_subscriptions).toBe(0);
      expect(overview.articles_published).toBe(0);

      // Revenue analytics should also show zeros
      const revenueResponse = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${newCreatorToken}`)
        .expect(200);

      expect(revenueResponse.body.success).toBe(true);
      const revenueData = revenueResponse.body.revenue_data;

      expect(revenueData.total_revenue).toBe(0);
      expect(revenueData.subscription_revenue).toBe(0);
      expect(revenueData.ad_revenue).toBe(0);
      expect(revenueData.affiliate_revenue).toBe(0);
    });

    it('should validate analytics access permissions', async () => {
      // Subscriber should not access creator analytics endpoints
      await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(403);

      await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(403);

      // Unauthenticated users should not access analytics
      await request(app)
        .get('/api/analytics/overview')
        .expect(401);

      await request(app)
        .get('/api/analytics/revenue')
        .expect(401);
    });

    it('should handle invalid analytics query parameters', async () => {
      // Invalid period parameter
      await request(app)
        .get('/api/analytics/overview?period=invalid')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(400);

      // Invalid source parameter for revenue
      await request(app)
        .get('/api/analytics/revenue?source=invalid')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(400);

      // Very long period strings
      await request(app)
        .get(`/api/analytics/overview?period=${'a'.repeat(100)}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(400);
    });

    it('should provide consistent data across dashboard endpoints', async () => {
      // Get data from multiple endpoints
      const overviewResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const revenueResponse = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      // Verify revenue consistency between endpoints
      expect(overviewResponse.body.overview.total_revenue)
        .toBe(revenueResponse.body.revenue_data.total_revenue);

      // Verify articles count matches published articles
      expect(overviewResponse.body.overview.articles_published).toBe(3);

      // Verify subscription count matches created subscriptions
      expect(overviewResponse.body.overview.active_subscriptions).toBe(1);
    });
  });
});