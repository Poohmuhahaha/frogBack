import request from 'supertest';
import app from '../../src/index';

describe('GET /api/analytics/revenue', () => {
  describe('Contract Tests', () => {
    let creatorToken: string;

    beforeAll(async () => {
      // Setup creator user
      const creator = {
        email: 'analyticsrevenue@example.com',
        password: 'SecurePass123',
        name: 'Analytics Revenue Creator',
        role: 'creator'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = registerResponse.body.token;
    });

    it('should return revenue analytics with default period', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('revenue_data');

      const { revenue_data } = response.body;
      expect(revenue_data).toHaveProperty('total_revenue');
      expect(revenue_data).toHaveProperty('subscription_revenue');
      expect(revenue_data).toHaveProperty('ad_revenue');
      expect(revenue_data).toHaveProperty('affiliate_revenue');
      expect(revenue_data).toHaveProperty('monthly_breakdown');
      expect(revenue_data).toHaveProperty('currency', 'USD');

      // Verify data types
      expect(typeof revenue_data.total_revenue).toBe('number');
      expect(typeof revenue_data.subscription_revenue).toBe('number');
      expect(typeof revenue_data.ad_revenue).toBe('number');
      expect(typeof revenue_data.affiliate_revenue).toBe('number');
      expect(Array.isArray(revenue_data.monthly_breakdown)).toBe(true);

      // Verify monthly breakdown structure
      if (revenue_data.monthly_breakdown.length > 0) {
        const monthData = revenue_data.monthly_breakdown[0];
        expect(monthData).toHaveProperty('month');
        expect(monthData).toHaveProperty('total');
        expect(monthData).toHaveProperty('subscriptions');
        expect(monthData).toHaveProperty('ads');
        expect(monthData).toHaveProperty('affiliate');
        expect(typeof monthData.total).toBe('number');
      }
    });

    it('should handle different period parameters', async () => {
      const periods = ['7d', '30d', '90d', '1y'];

      for (const period of periods) {
        const response = await request(app)
          .get(`/api/analytics/revenue?period=${period}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('revenue_data');
      }
    });

    it('should filter by revenue source', async () => {
      const sources = ['subscription', 'ads', 'affiliate'];

      for (const source of sources) {
        const response = await request(app)
          .get(`/api/analytics/revenue?source=${source}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('revenue_data');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 400 for invalid period parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue?period=invalid')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'INVALID_PARAMETER');
    });

    it('should return 400 for invalid source parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue?source=invalid')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'INVALID_PARAMETER');
    });

    it('should return zero revenue for new accounts', async () => {
      // New creator should have zero revenue
      const newCreator = {
        email: 'newrevenue@example.com',
        password: 'SecurePass123',
        name: 'New Revenue Creator',
        role: 'creator'
      };

      const newResponse = await request(app)
        .post('/api/auth/register')
        .send(newCreator);

      const response = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${newResponse.body.token}`)
        .expect(200);

      const { revenue_data } = response.body;
      expect(revenue_data.total_revenue).toBe(0);
      expect(revenue_data.subscription_revenue).toBe(0);
      expect(revenue_data.ad_revenue).toBe(0);
      expect(revenue_data.affiliate_revenue).toBe(0);
    });

    it('should validate numeric constraints', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const { revenue_data } = response.body;

      // All revenue amounts should be non-negative
      expect(revenue_data.total_revenue).toBeGreaterThanOrEqual(0);
      expect(revenue_data.subscription_revenue).toBeGreaterThanOrEqual(0);
      expect(revenue_data.ad_revenue).toBeGreaterThanOrEqual(0);
      expect(revenue_data.affiliate_revenue).toBeGreaterThanOrEqual(0);

      // Total should equal sum of components
      const calculatedTotal = revenue_data.subscription_revenue +
                             revenue_data.ad_revenue +
                             revenue_data.affiliate_revenue;
      expect(revenue_data.total_revenue).toBe(calculatedTotal);
    });

    it('should handle edge case with zero revenue data', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue?period=7d')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should not crash with division by zero or null values
      expect(response.body.revenue_data).toBeDefined();
      expect(response.body.revenue_data.currency).toBe('USD');
    });
  });
});