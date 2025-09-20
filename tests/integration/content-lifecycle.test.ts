import request from 'supertest';
import app from '../../src/index';

describe('Content Lifecycle Flow', () => {
  describe('Integration Tests', () => {
    let creatorToken: string;
    let creatorId: string;
    let subscriberToken: string;

    beforeAll(async () => {
      // Setup creator
      const creator = {
        email: 'content.lifecycle.creator@example.com',
        password: 'SecurePass123',
        name: 'Lifecycle Creator',
        role: 'creator'
      };

      const creatorResponse = await request(app)
        .post('/api/auth/register')
        .send(creator);

      creatorToken = creatorResponse.body.token;
      creatorId = creatorResponse.body.user.id;

      // Setup subscriber
      const subscriber = {
        email: 'content.lifecycle.subscriber@example.com',
        password: 'SecurePass123',
        name: 'Lifecycle Subscriber',
        role: 'subscriber'
      };

      const subscriberResponse = await request(app)
        .post('/api/auth/register')
        .send(subscriber);

      subscriberToken = subscriberResponse.body.token;
    });

    it('should complete full content creation, editing, and publishing lifecycle', async () => {
      // Step 1: Create draft article
      const initialArticleData = {
        title: 'The Evolution of Academic Research',
        content: '<p>Initial draft content about academic research.</p>',
        excerpt: 'Initial thoughts on research',
        tags: ['research', 'academic'],
        seo_title: 'Academic Research Evolution',
        seo_description: 'Exploring how academic research has evolved',
        is_premium: false
      };

      const createResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(initialArticleData)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.article.status).toBe('draft');
      expect(createResponse.body.article.author_id).toBe(creatorId);

      const articleId = createResponse.body.article.id;

      // Step 2: Edit and expand the article
      const updatedArticleData = {
        title: 'The Evolution of Academic Research: A Comprehensive Analysis',
        content: `<h1>The Evolution of Academic Research</h1>
                  <p>Academic research has undergone significant transformation over the past decades.</p>
                  <h2>Digital Revolution</h2>
                  <p>The digital age has revolutionized how we conduct and share research.</p>
                  <h2>Collaboration and Open Science</h2>
                  <p>Modern research emphasizes collaboration and open access to knowledge.</p>`,
        excerpt: 'A comprehensive look at how academic research has evolved in the digital age',
        tags: ['research', 'academic', 'digital-transformation', 'collaboration'],
        seo_title: 'Academic Research Evolution: Digital Age Analysis',
        seo_description: 'Comprehensive analysis of academic research evolution in the digital era'
      };

      const updateResponse = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(updatedArticleData)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.article.title).toBe(updatedArticleData.title);
      expect(updateResponse.body.article.reading_time).toBeGreaterThan(0);

      // Step 3: Schedule article for future publication
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const scheduleResponse = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ scheduled_at: futureDate.toISOString() })
        .expect(200);

      expect(scheduleResponse.body.success).toBe(true);
      expect(scheduleResponse.body.article.status).toBe('published');
      expect(scheduleResponse.body.article.published_at).toBe(futureDate.toISOString());

      // Step 4: Verify article is not yet visible to public (scheduled)
      const publicArticlesResponse = await request(app)
        .get('/api/articles')
        .expect(200);

      const publicArticle = publicArticlesResponse.body.articles.find(
        (article: any) => article.id === articleId
      );
      // Article should be in response but marked as scheduled
      expect(publicArticle).toBeDefined();
      expect(new Date(publicArticle.published_at).getTime()).toBeGreaterThan(Date.now());

      // Step 5: Create and immediately publish another article
      const immediateArticleData = {
        title: 'Breaking: New Research Methodology Discovered',
        content: '<p>Exciting news about a breakthrough in research methodology.</p>',
        excerpt: 'Breakthrough research methodology news',
        tags: ['research', 'methodology', 'breakthrough'],
        is_premium: true
      };

      const immediateCreateResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(immediateArticleData)
        .expect(201);

      const immediateArticleId = immediateCreateResponse.body.article.id;

      const immediatePublishResponse = await request(app)
        .post(`/api/articles/${immediateArticleId}/publish`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ scheduled_at: null })
        .expect(200);

      expect(immediatePublishResponse.body.success).toBe(true);
      expect(immediatePublishResponse.body.article.status).toBe('published');
      expect(new Date(immediatePublishResponse.body.article.published_at).getTime())
        .toBeLessThanOrEqual(Date.now());

      // Step 6: Verify analytics update
      const analyticsResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.overview.articles_published).toBe(2);

      // Step 7: Test content access for different user types
      // Public user should see non-premium content
      const publicContentResponse = await request(app)
        .get(`/api/articles/${articleId}`)
        .expect(200);

      expect(publicContentResponse.body.success).toBe(true);
      expect(publicContentResponse.body.article.content).toBeDefined();

      // Subscriber should not see premium content without subscription
      const subscriberContentResponse = await request(app)
        .get(`/api/articles/${immediateArticleId}`)
        .set('Authorization', `Bearer ${subscriberToken}`)
        .expect(200);

      if (subscriberContentResponse.body.article.is_premium) {
        expect(subscriberContentResponse.body.article.content).toBeUndefined();
      }

      // Step 8: Update article after publication
      const postPublishUpdate = {
        content: updatedArticleData.content + '<p>Updated after publication with additional insights.</p>'
      };

      const postPublishUpdateResponse = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(postPublishUpdate)
        .expect(200);

      expect(postPublishUpdateResponse.body.success).toBe(true);
      expect(postPublishUpdateResponse.body.article.content).toContain('Updated after publication');
    });

    it('should handle content validation and error scenarios', async () => {
      // Test creating article with invalid data
      const invalidArticleData = {
        title: '', // Empty title
        content: 'A'.repeat(10001), // Too long content
        tags: ['a'.repeat(51)] // Tag too long
      };

      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(invalidArticleData)
        .expect(400);

      // Test publishing non-existent article
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app)
        .post(`/api/articles/${fakeId}/publish`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ scheduled_at: null })
        .expect(404);

      // Test unauthorized access to edit
      const validArticleData = {
        title: 'Test Article for Unauthorized Access',
        content: '<p>Test content.</p>'
      };

      const articleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(validArticleData)
        .expect(201);

      await request(app)
        .put(`/api/articles/${articleResponse.body.article.id}`)
        .set('Authorization', `Bearer ${subscriberToken}`)
        .send({ title: 'Unauthorized Update' })
        .expect(403);
    });
  });
});