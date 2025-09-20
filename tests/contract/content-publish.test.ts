import request from 'supertest';
import app from '../../src/index';

describe('POST /api/articles/{id}/publish', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let articleId: string;

    beforeAll(async () => {
      // Setup test user and draft article
      const creator = {
        email: 'articlepublish@example.com',
        password: 'SecurePass123',
        name: 'Article Publish Creator',
        role: 'creator'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      authToken = registerResponse.body.token;

      // Create draft article
      const articleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Article to Publish',
          content: '<p>Content ready for publishing.</p>',
          excerpt: 'Ready to publish'
        });

      articleId = articleResponse.body.article.id;
    });

    it('should publish draft article immediately', async () => {
      const publishData = {
        scheduled_at: null // Immediate publication
      };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('article');

      const { article } = response.body;
      expect(article.status).toBe('published');
      expect(article.published_at).not.toBeNull();
      expect(new Date(article.published_at)).toBeInstanceOf(Date);
      expect(new Date(article.published_at).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should schedule article for future publication', async () => {
      // Create another draft article for scheduled publishing
      const draftResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Scheduled Article',
          content: '<p>Content for scheduled publishing.</p>'
        });

      const draftId = draftResponse.body.article.id;
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const publishData = {
        scheduled_at: futureDate.toISOString()
      };

      const response = await request(app)
        .post(`/api/articles/${draftId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      const { article } = response.body;
      expect(article.status).toBe('published'); // Status changes even for scheduled
      expect(article.published_at).toBe(futureDate.toISOString());
    });

    it('should return 401 for unauthenticated requests', async () => {
      const publishData = { scheduled_at: null };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 403 for unauthorized user', async () => {
      // Create another user
      const otherUser = {
        email: 'otherpublisher@example.com',
        password: 'SecurePass123',
        name: 'Other Publisher',
        role: 'creator'
      };

      const otherResponse = await request(app)
        .post('/api/auth/register')
        .send(otherUser);

      const otherToken = otherResponse.body.token;

      const publishData = { scheduled_at: null };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 404 for non-existent article', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      const publishData = { scheduled_at: null };

      const response = await request(app)
        .post(`/api/articles/${fakeId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'ARTICLE_NOT_FOUND');
    });

    it('should validate scheduled_at date format', async () => {
      const invalidPublishData = {
        scheduled_at: 'invalid-date-format'
      };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPublishData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject past dates for scheduled publishing', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const publishData = {
        scheduled_at: pastDate.toISOString()
      };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle already published articles', async () => {
      // Try to publish an already published article
      const publishData = { scheduled_at: null };

      const response = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(publishData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/already.*published/i);
    });
  });
});