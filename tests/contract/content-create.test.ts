import request from 'supertest';
import app from '../../src/index';

describe('POST /api/articles', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let creatorId: string;

    const testCreator = {
      email: 'articlecreate@example.com',
      password: 'SecurePass123',
      name: 'Article Create Creator',
      role: 'creator'
    };

    beforeAll(async () => {
      // Register creator for article creation tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testCreator);

      authToken = registerResponse.body.token;
      creatorId = registerResponse.body.user.id;
    });

    it('should create new article with valid data', async () => {
      const articleData = {
        title: 'Advanced Machine Learning Techniques',
        content: '<p>Neural networks are powerful tools for machine learning...</p>',
        excerpt: 'Explore cutting-edge ML algorithms and their practical applications',
        tags: ['machine-learning', 'neural-networks', 'ai'],
        seo_title: 'Advanced ML Techniques | Data Science Blog',
        seo_description: 'Learn advanced machine learning techniques with practical examples'
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(articleData)
        .expect('Content-Type', /json/)
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('article');

      // Verify article object structure
      const { article } = response.body;
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('author_id', creatorId);
      expect(article).toHaveProperty('title', articleData.title);
      expect(article).toHaveProperty('slug');
      expect(article).toHaveProperty('content', articleData.content);
      expect(article).toHaveProperty('excerpt', articleData.excerpt);
      expect(article).toHaveProperty('featured_image_url', null);
      expect(article).toHaveProperty('status', 'draft'); // New articles start as draft
      expect(article).toHaveProperty('is_premium', false); // Default value
      expect(article).toHaveProperty('seo_title', articleData.seo_title);
      expect(article).toHaveProperty('seo_description', articleData.seo_description);
      expect(article).toHaveProperty('tags');
      expect(article).toHaveProperty('reading_time');
      expect(article).toHaveProperty('published_at', null); // Draft articles not published
      expect(article).toHaveProperty('created_at');
      expect(article).toHaveProperty('updated_at');

      // Verify data types and values
      expect(typeof article.id).toBe('string');
      expect(typeof article.slug).toBe('string');
      expect(Array.isArray(article.tags)).toBe(true);
      expect(article.tags).toEqual(articleData.tags);
      expect(typeof article.reading_time).toBe('number');
      expect(article.reading_time).toBeGreaterThan(0);
    });

    it('should create article with minimal required data', async () => {
      const minimalData = {
        title: 'Minimal Article',
        content: '<p>Minimal content for testing.</p>'
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(minimalData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.article.title).toBe(minimalData.title);
      expect(response.body.article.content).toBe(minimalData.content);
      expect(response.body.article.excerpt).toBe(null);
      expect(response.body.article.tags).toEqual([]);
    });

    it('should create premium article when specified', async () => {
      const premiumData = {
        title: 'Premium Article',
        content: '<p>This is premium content.</p>',
        is_premium: true
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(premiumData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.article.is_premium).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const articleData = {
        title: 'Unauthorized Article',
        content: '<p>This should fail.</p>'
      };

      const response = await request(app)
        .post('/api/articles')
        .send(articleData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 400 for missing title', async () => {
      const invalidData = {
        content: '<p>Content without title.</p>'
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code');
    });

    it('should return 400 for missing content', async () => {
      const invalidData = {
        title: 'Title without content'
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for title too long', async () => {
      const invalidData = {
        title: 'A'.repeat(201), // Exceeds 200 character limit
        content: '<p>Valid content.</p>'
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for excerpt too long', async () => {
      const invalidData = {
        title: 'Valid Title',
        content: '<p>Valid content.</p>',
        excerpt: 'A'.repeat(501) // Exceeds 500 character limit
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for SEO fields too long', async () => {
      const invalidData = {
        title: 'Valid Title',
        content: '<p>Valid content.</p>',
        seo_title: 'A'.repeat(201), // Exceeds 200 character limit
        seo_description: 'B'.repeat(301) // Exceeds 300 character limit
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should generate unique slug for duplicate titles', async () => {
      const articleData = {
        title: 'Duplicate Title Article',
        content: '<p>First article with this title.</p>'
      };

      // Create first article
      const response1 = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(articleData)
        .expect(201);

      // Create second article with same title
      const response2 = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...articleData,
          content: '<p>Second article with same title.</p>'
        })
        .expect(201);

      expect(response1.body.article.slug).not.toBe(response2.body.article.slug);
      expect(response1.body.article.title).toBe(response2.body.article.title);
    });

    it('should calculate reading time automatically', async () => {
      const longContent = '<p>' + 'word '.repeat(200) + '</p>'; // ~200 words
      const articleData = {
        title: 'Reading Time Test',
        content: longContent
      };

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(articleData)
        .expect(201);

      expect(response.body.article.reading_time).toBeGreaterThan(0);
      expect(typeof response.body.article.reading_time).toBe('number');
    });
  });
});