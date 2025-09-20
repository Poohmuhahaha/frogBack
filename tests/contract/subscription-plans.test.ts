import request from 'supertest';
import app from '../../src/index';

describe('GET /api/subscription-plans', () => {
  describe('Contract Tests', () => {
    let creatorToken: string;
    let creatorId: string;

    beforeAll(async () => {
      // Setup creator user
      const creator = {
        email: 'subscriptionplans@example.com',
        password: 'SecurePass123',
        name: 'Subscription Plans Creator',
        role: 'creator'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = registerResponse.body.token;
      creatorId = registerResponse.body.user.id;
    });

    it('should return all active subscription plans', async () => {
      const response = await request(app)
        .get('/api/subscription-plans')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('plans');
      expect(Array.isArray(response.body.plans)).toBe(true);
    });

    it('should filter plans by creator', async () => {
      const response = await request(app)
        .get(`/api/subscription-plans?creator_id=${creatorId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.plans)).toBe(true);
    });

    it('should return plans with correct structure', async () => {
      // First create a plan to ensure we have data
      const planData = {
        name: 'Premium Access',
        description: 'Access to all premium content',
        price: 999,
        currency: 'USD',
        features: ['Premium articles', 'Weekly newsletter']
      };

      await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(planData);

      const response = await request(app)
        .get('/api/subscription-plans')
        .expect(200);

      if (response.body.plans.length > 0) {
        const plan = response.body.plans[0];

        expect(plan).toHaveProperty('id');
        expect(plan).toHaveProperty('creator_id');
        expect(plan).toHaveProperty('name');
        expect(plan).toHaveProperty('description');
        expect(plan).toHaveProperty('price');
        expect(plan).toHaveProperty('currency');
        expect(plan).toHaveProperty('features');
        expect(plan).toHaveProperty('is_active');
        expect(plan).toHaveProperty('stripe_price_id');
        expect(plan).toHaveProperty('created_at');

        expect(typeof plan.id).toBe('string');
        expect(typeof plan.name).toBe('string');
        expect(typeof plan.price).toBe('number');
        expect(Array.isArray(plan.features)).toBe(true);
        expect(typeof plan.is_active).toBe('boolean');
      }
    });

    it('should only return active plans by default', async () => {
      const response = await request(app)
        .get('/api/subscription-plans')
        .expect(200);

      response.body.plans.forEach((plan: any) => {
        expect(plan.is_active).toBe(true);
      });
    });

    it('should validate creator_id parameter', async () => {
      const response = await request(app)
        .get('/api/subscription-plans?creator_id=invalid-uuid')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});