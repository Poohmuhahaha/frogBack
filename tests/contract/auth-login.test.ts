import request from 'supertest';
import app from '../../src/index';

describe('POST /api/auth/login', () => {
  describe('Contract Tests', () => {
    // Setup: Create a test user for login tests
    const testUser = {
      email: 'logintest@example.com',
      password: 'SecurePass123',
      name: 'Login Test User',
      role: 'creator'
    };

    beforeAll(async () => {
      // Register a test user for login tests
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('should authenticate user with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');

      // Verify user object structure
      const { user } = response.body;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email', testUser.email);
      expect(user).toHaveProperty('name', testUser.name);
      expect(user).toHaveProperty('role', testUser.role);
      expect(user).toHaveProperty('email_verified');
      expect(user).toHaveProperty('created_at');
      expect(user).not.toHaveProperty('password_hash'); // Should not expose password

      // Verify token is present and is a string
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should return 401 for invalid email', async () => {
      const invalidData = {
        email: 'nonexistent@example.com',
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 401 for invalid password', async () => {
      const invalidData = {
        email: testUser.email,
        password: 'WrongPassword123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 400 for missing email', async () => {
      const incompleteData = {
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(incompleteData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for missing password', async () => {
      const incompleteData = {
        email: testUser.email
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(incompleteData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid email format', async () => {
      const invalidData = {
        email: 'invalid-email-format',
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle case-insensitive email login', async () => {
      const loginData = {
        email: testUser.email.toUpperCase(),
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(testUser.email.toLowerCase());
    });
  });
});