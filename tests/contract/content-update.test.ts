import request from 'supertest';
import app from '../../src/index';

describe('PUT /api/articles/{id}', () => {
  describe('Contract Tests', () => {
    let authToken: string;
    let otherUserToken: string;
    let articleId: string;
    let otherUserArticleId: string;

    beforeAll(async () => {
      // Setup test users and articles
      const creator1 = {
        email: 'articleupdate1@example.com',
        password: 'SecurePass123',
        name: 'Article Update Creator 1',
        role: 'creator'
      };

      const creator2 = {
        email: 'articleupdate2@example.com',
        password: 'SecurePass123',
        name: 'Article Update Creator 2',
        role: 'creator'
      };

      const response1 = await request(app).post('/api/auth/register').send(creator1);
      const response2 = await request(app).post('/api/auth/register').send(creator2);

      authToken = response1.body.token;
      otherUserToken = response2.body.token;

      // Create test articles
      const articleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Article to Update',
          content: '<p>Original content.</p>',
          tags: ['original']
        });

      const otherArticleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          title: 'Other User Article',
          content: '<p>Other user content.</p>'
        });

      articleId = articleResponse.body.article.id;
      otherUserArticleId = otherArticleResponse.body.article.id;
    });

    it('should update article with valid data', async () => {
      const updateData = {
        title: 'Updated Article Title',
        content: '<p>Updated content with more details.</p>',
        excerpt: 'Updated excerpt',
        tags: ['updated', 'test'],
        seo_title: 'Updated SEO Title',
        seo_description: 'Updated SEO description'
      };

      const response = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('article');

      const { article } = response.body;
      expect(article.title).toBe(updateData.title);
      expect(article.content).toBe(updateData.content);
      expect(article.excerpt).toBe(updateData.excerpt);
      expect(article.tags).toEqual(updateData.tags);
      expect(article.seo_title).toBe(updateData.seo_title);
      expect(article.seo_description).toBe(updateData.seo_description);
      expect(article.updated_at).not.toBe(article.created_at);
    });

    it('should update partial article data', async () => {
      const partialUpdate = {
        title: 'Partially Updated Title'
      };

      const response = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(partialUpdate)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.article.title).toBe(partialUpdate.title);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const updateData = {
        title: 'Unauthorized Update'
      };

      const response = await request(app)
        .put(`/api/articles/${articleId}`)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should return 403 for unauthorized user', async () => {
      const updateData = {
        title: 'Forbidden Update'
      };

      const response = await request(app)
        .put(`/api/articles/${otherUserArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for non-existent article', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      const updateData = {
        title: 'Update Non-existent'
      };

      const response = await request(app)
        .put(`/api/articles/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', 'ARTICLE_NOT_FOUND');
    });

    it('should validate field lengths on update', async () => {
      const invalidUpdate = {
        title: 'A'.repeat(201), // Too long
        seo_description: 'B'.repeat(301) // Too long
      };

      const response = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdate)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should recalculate reading time on content update', async () => {
      const longContent = '<p>' + 'word '.repeat(300) + '</p>';
      const updateData = {
        content: longContent
      };

      const response = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.article.reading_time).toBeGreaterThan(0);
    });
  });
});