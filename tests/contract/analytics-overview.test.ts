import request from 'supertest';
import app from '../../src/index';

describe('GET /api/analytics/overview', () => {
  describe('Contract Tests', () => {
    let creatorToken: string;

    beforeAll(async () => {
      // Setup creator user
      const creator = {
        email: 'analyticsoverview@example.com',
        password: 'SecurePass123',
        name: 'Analytics Creator',
        role: 'creator'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = registerResponse.body.token;
    });

    it('should return analytics overview with default period', async () => {
      const response = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('overview');

      const { overview } = response.body;
      expect(overview).toHaveProperty('total_page_views');
      expect(overview).toHaveProperty('unique_visitors');
      expect(overview).toHaveProperty('total_revenue');
      expect(overview).toHaveProperty('newsletter_subscribers');
      expect(overview).toHaveProperty('active_subscriptions');
      expect(overview).toHaveProperty('articles_published');
      expect(overview).toHaveProperty('avg_time_on_page');
      expect(overview).toHaveProperty('bounce_rate');
      expect(overview).toHaveProperty('growth_metrics');

      // Verify data types
      expect(typeof overview.total_page_views).toBe('number');
      expect(typeof overview.unique_visitors).toBe('number');
      expect(typeof overview.total_revenue).toBe('number');
      expect(typeof overview.newsletter_subscribers).toBe('number');
      expect(typeof overview.active_subscriptions).toBe('number');
      expect(typeof overview.articles_published).toBe('number');
      expect(typeof overview.avg_time_on_page).toBe('number');
      expect(typeof overview.bounce_rate).toBe('number');

      // Verify growth metrics structure
      expect(overview.growth_metrics).toHaveProperty('page_views_growth');
      expect(overview.growth_metrics).toHaveProperty('revenue_growth');
      expect(overview.growth_metrics).toHaveProperty('subscriber_growth');
      expect(typeof overview.growth_metrics.page_views_growth).toBe('number');
      expect(typeof overview.growth_metrics.revenue_growth).toBe('number');
      expect(typeof overview.growth_metrics.subscriber_growth).toBe('number');
    });

    it('should handle different period parameters', async () => {
      const periods = ['7d', '30d', '90d', '1y'];

      for (const period of periods) {
        const response = await request(app)
          .get(`/api/analytics/overview?period=${period}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('overview');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/analytics/overview')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 400 for invalid period parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/overview?period=invalid')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'INVALID_PARAMETER');
    });

    it('should return zero values for new accounts', async () => {
      // New creator should have zero analytics
      const newCreator = {
        email: 'newanalytics@example.com',
        password: 'SecurePass123',
        name: 'New Analytics Creator',
        role: 'creator'
      };

      const newResponse = await request(app)
        .post('/api/auth/register')
        .send(newCreator);

      const response = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${newResponse.body.token}`)
        .expect(200);

      const { overview } = response.body;
      expect(overview.total_page_views).toBe(0);
      expect(overview.unique_visitors).toBe(0);
      expect(overview.total_revenue).toBe(0);
      expect(overview.articles_published).toBe(0);
    });

    it('should validate numeric constraints', async () => {
      const response = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const { overview } = response.body;

      // All counts should be non-negative
      expect(overview.total_page_views).toBeGreaterThanOrEqual(0);
      expect(overview.unique_visitors).toBeGreaterThanOrEqual(0);
      expect(overview.total_revenue).toBeGreaterThanOrEqual(0);
      expect(overview.newsletter_subscribers).toBeGreaterThanOrEqual(0);
      expect(overview.active_subscriptions).toBeGreaterThanOrEqual(0);
      expect(overview.articles_published).toBeGreaterThanOrEqual(0);
      expect(overview.avg_time_on_page).toBeGreaterThanOrEqual(0);

      // Bounce rate should be between 0 and 1
      expect(overview.bounce_rate).toBeGreaterThanOrEqual(0);
      expect(overview.bounce_rate).toBeLessThanOrEqual(1);
    });

    it('should handle edge case with zero data', async () => {
      const response = await request(app)
        .get('/api/analytics/overview?period=7d')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should not crash with division by zero or null values
      expect(response.body.overview).toBeDefined();
    });
  });
});