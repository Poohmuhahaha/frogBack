import request from 'supertest';
import app from '../../src/index';

describe('GET /api/auth/me', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let userId: string;

    const testUser = {
      email: 'authme@example.com',
      password: 'SecurePass123',
      name: 'Auth Me Test User',
      role: 'creator'
    };

    beforeAll(async () => {
      // Register and login to get auth token
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      authToken = registerResponse.body.token;
      userId = registerResponse.body.user.id;
    });

    it('should return current user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');

      // Verify user object structure
      const { user } = response.body;
      expect(user).toHaveProperty('id', userId);
      expect(user).toHaveProperty('email', testUser.email);
      expect(user).toHaveProperty('name', testUser.name);
      expect(user).toHaveProperty('role', testUser.role);
      expect(user).toHaveProperty('bio');
      expect(user).toHaveProperty('avatar_url');
      expect(user).toHaveProperty('email_verified');
      expect(user).toHaveProperty('created_at');
      expect(user).not.toHaveProperty('password_hash'); // Should not expose password
    });

    it('should return 401 for missing authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 401 for malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token-here')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 401 for expired token', async () => {
      // This would require creating an expired token
      // For now, we'll use a malformed token that represents an expired one
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.expired';

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle bearer token with different casing', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `bearer ${authToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(userId);
    });

    it('should return consistent user data structure', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { user } = response.body;

      // Verify all required fields are present with correct types
      expect(typeof user.id).toBe('string');
      expect(typeof user.email).toBe('string');
      expect(typeof user.name).toBe('string');
      expect(typeof user.role).toBe('string');
      expect(['creator', 'subscriber', 'admin']).toContain(user.role);
      expect(typeof user.email_verified).toBe('boolean');
      expect(typeof user.created_at).toBe('string');

      // Optional fields can be null
      expect(['string', 'object']).toContain(typeof user.bio); // null or string
      expect(['string', 'object']).toContain(typeof user.avatar_url); // null or string
    });
  });
});