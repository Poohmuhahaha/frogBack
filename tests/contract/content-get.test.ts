import request from 'supertest';
import app from '../../src/index';

describe('GET /api/articles/{id}', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let articleId: string;
    let premiumArticleId: string;

    beforeAll(async () => {
      // Setup test data
      const creator = {
        email: 'articleget@example.com',
        password: 'SecurePass123',
        name: 'Article Get Creator',
        role: 'creator'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      authToken = registerResponse.body.token;

      // Create test articles
      const articleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Article for Get',
          content: '<p>This is test content.</p>',
          excerpt: 'Test excerpt',
          tags: ['test']
        });

      const premiumResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Premium Test Article',
          content: '<p>This is premium content.</p>',
          is_premium: true
        });

      articleId = articleResponse.body.article.id;
      premiumArticleId = premiumResponse.body.article.id;
    });

    it('should return article by valid ID', async () => {
      const response = await request(app)
        .get(`/api/articles/${articleId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('article');

      const { article } = response.body;
      expect(article.id).toBe(articleId);
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('content');
      expect(article).toHaveProperty('author_id');
      expect(article).toHaveProperty('slug');
      expect(article).toHaveProperty('status');
      expect(article).toHaveProperty('tags');
      expect(article).toHaveProperty('created_at');
    });

    it('should return 404 for non-existent article', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app)
        .get(`/api/articles/${fakeId}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'ARTICLE_NOT_FOUND');
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/articles/invalid-uuid')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should require authentication for premium articles', async () => {
      const response = await request(app)
        .get(`/api/articles/${premiumArticleId}`)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should allow authenticated users to access premium articles', async () => {
      const response = await request(app)
        .get(`/api/articles/${premiumArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.article.is_premium).toBe(true);
    });
  });
});