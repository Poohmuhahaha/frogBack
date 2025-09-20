import request from 'supertest';
import app from '../../src/index';

describe('POST /api/auth/register', () => {
  describe('Contract Tests', () => {
    it('should register a new creator account with valid data', async () => {
      const userData = {
        email: 'creator@example.com',
        password: 'SecurePass123',
        name: 'Jane Creator',
        role: 'creator'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');

      // Verify user object structure
      const { user } = response.body;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email', userData.email);
      expect(user).toHaveProperty('name', userData.name);
      expect(user).toHaveProperty('role', userData.role);
      expect(user).toHaveProperty('email_verified', false);
      expect(user).toHaveProperty('created_at');
      expect(user).not.toHaveProperty('password_hash'); // Should not expose password

      // Verify token is present and is a string
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should register a new subscriber account with valid data', async () => {
      const userData = {
        email: 'subscriber@example.com',
        password: 'SecurePass123',
        name: 'John Subscriber',
        role: 'subscriber'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.role).toBe('subscriber');
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        email: 'test@example.com',
        password: 'SecurePass123'
        // Missing name and role
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(incompleteData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code');
    });

    it('should return 400 for invalid email format', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'SecurePass123',
        name: 'Test User',
        role: 'creator'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'short',
        name: 'Test User',
        role: 'creator'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid role', async () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'SecurePass123',
        name: 'Test User',
        role: 'invalid_role'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for duplicate email address', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'SecurePass123',
        name: 'First User',
        role: 'creator'
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email should fail
      const duplicateData = {
        ...userData,
        name: 'Second User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/email.*already.*exists/i);
    });

    it('should return 400 for name too short or too long', async () => {
      // Test name too short
      const shortNameData = {
        email: 'shortname@example.com',
        password: 'SecurePass123',
        name: 'A',
        role: 'creator'
      };

      const shortResponse = await request(app)
        .post('/api/auth/register')
        .send(shortNameData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(shortResponse.body.success).toBe(false);

      // Test name too long (101 characters)
      const longNameData = {
        email: 'longname@example.com',
        password: 'SecurePass123',
        name: 'A'.repeat(101),
        role: 'creator'
      };

      const longResponse = await request(app)
        .post('/api/auth/register')
        .send(longNameData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(longResponse.body.success).toBe(false);
    });
  });
});