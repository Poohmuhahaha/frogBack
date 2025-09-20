import request from 'supertest';
import app from '../../src/index';

describe('GET /api/articles', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let creatorId: string;

    const testCreator = {
      email: 'articlelist@example.com',
      password: 'SecurePass123',
      name: 'Article List Creator',
      role: 'creator'
    };

    beforeAll(async () => {
      // Register creator for article tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testCreator);

      authToken = registerResponse.body.token;
      creatorId = registerResponse.body.user.id;
    });

    it('should return paginated list of published articles', async () => {
      const response = await request(app)
        .get('/api/articles')
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('articles');
      expect(response.body).toHaveProperty('pagination');

      // Verify articles array structure
      expect(Array.isArray(response.body.articles)).toBe(true);

      // Verify pagination structure
      const { pagination } = response.body;
      expect(pagination).toHaveProperty('page');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('total');
      expect(pagination).toHaveProperty('pages');
      expect(typeof pagination.page).toBe('number');
      expect(typeof pagination.limit).toBe('number');
      expect(typeof pagination.total).toBe('number');
      expect(typeof pagination.pages).toBe('number');
    });

    it('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/articles?page=2&limit=5')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should filter articles by tag', async () => {
      const response = await request(app)
        .get('/api/articles?tag=machine-learning')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.articles)).toBe(true);
    });

    it('should filter articles by author', async () => {
      const response = await request(app)
        .get(`/api/articles?author=${creatorId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.articles)).toBe(true);
    });

    it('should return articles with correct structure when present', async () => {
      // First create an article to ensure we have data
      const articleData = {
        title: 'Test Article for List',
        content: '<p>This is test content for the article list.</p>',
        excerpt: 'Test excerpt for listing',
        tags: ['test', 'article'],
        seo_title: 'Test Article SEO Title',
        seo_description: 'Test article for SEO purposes'
      };

      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(articleData);

      const response = await request(app)
        .get('/api/articles')
        .expect(200);

      if (response.body.articles.length > 0) {
        const article = response.body.articles[0];

        // Verify article structure matches contract
        expect(article).toHaveProperty('id');
        expect(article).toHaveProperty('author_id');
        expect(article).toHaveProperty('title');
        expect(article).toHaveProperty('slug');
        expect(article).toHaveProperty('content');
        expect(article).toHaveProperty('excerpt');
        expect(article).toHaveProperty('featured_image_url');
        expect(article).toHaveProperty('status', 'published'); // Only published articles in public list
        expect(article).toHaveProperty('is_premium');
        expect(article).toHaveProperty('seo_title');
        expect(article).toHaveProperty('seo_description');
        expect(article).toHaveProperty('tags');
        expect(article).toHaveProperty('reading_time');
        expect(article).toHaveProperty('published_at');
        expect(article).toHaveProperty('created_at');
        expect(article).toHaveProperty('updated_at');

        // Verify data types
        expect(typeof article.id).toBe('string');
        expect(typeof article.title).toBe('string');
        expect(typeof article.slug).toBe('string');
        expect(typeof article.is_premium).toBe('boolean');
        expect(Array.isArray(article.tags)).toBe(true);
        expect(['number', 'object']).toContain(typeof article.reading_time); // null or number
      }
    });

    it('should validate page parameter bounds', async () => {
      // Test page < 1
      const response1 = await request(app)
        .get('/api/articles?page=0')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response1.body.success).toBe(false);

      // Test valid minimum page
      const response2 = await request(app)
        .get('/api/articles?page=1')
        .expect(200);

      expect(response2.body.success).toBe(true);
    });

    it('should validate limit parameter bounds', async () => {
      // Test limit < 1
      const response1 = await request(app)
        .get('/api/articles?limit=0')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response1.body.success).toBe(false);

      // Test limit > 50
      const response2 = await request(app)
        .get('/api/articles?limit=51')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response2.body.success).toBe(false);

      // Test valid limit
      const response3 = await request(app)
        .get('/api/articles?limit=10')
        .expect(200);

      expect(response3.body.success).toBe(true);
    });

    it('should return default pagination values', async () => {
      const response = await request(app)
        .get('/api/articles')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should handle invalid UUID for author filter', async () => {
      const response = await request(app)
        .get('/api/articles?author=invalid-uuid')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});