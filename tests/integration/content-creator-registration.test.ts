import request from 'supertest';
import app from '../../src/index';

describe('Content Creator Registration Flow', () => {
  describe('Integration Tests', () => {
    it('should complete full content creator registration and setup workflow', async () => {
      const creatorData = {
        email: 'creator.integration@example.com',
        password: 'SecurePass123',
        name: 'Integration Test Creator',
        role: 'creator'
      };

      // Step 1: Register new creator
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(creatorData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.token).toBeDefined();
      expect(registerResponse.body.user.email).toBe(creatorData.email);
      expect(registerResponse.body.user.role).toBe('creator');

      const token = registerResponse.body.token;
      const userId = registerResponse.body.user.id;

      // Step 2: Verify authentication works
      const authResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(authResponse.body.user.id).toBe(userId);
      expect(authResponse.body.user.email).toBe(creatorData.email);

      // Step 3: Create first subscription plan
      const planData = {
        name: 'Creator Premium',
        description: 'Premium access to creator content',
        price: 1999, // $19.99
        currency: 'USD',
        features: ['Premium articles', 'Weekly newsletter', 'Ad-free experience']
      };

      const planResponse = await request(app)
        .post('/api/subscription-plans')
        .set('Authorization', `Bearer ${token}`)
        .send(planData)
        .expect(201);

      expect(planResponse.body.success).toBe(true);
      expect(planResponse.body.plan.creator_id).toBe(userId);
      expect(planResponse.body.plan.name).toBe(planData.name);
      expect(planResponse.body.plan.price).toBe(planData.price);

      // Step 4: Create first draft article
      const articleData = {
        title: 'Welcome to My Academic Journey',
        content: '<p>This is my first article on this platform...</p>',
        excerpt: 'Introduction to my academic content',
        tags: ['introduction', 'academic'],
        seo_title: 'Welcome - Academic Content Creator',
        seo_description: 'Join me on my academic journey with quality content'
      };

      const articleResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send(articleData)
        .expect(201);

      expect(articleResponse.body.success).toBe(true);
      expect(articleResponse.body.article.author_id).toBe(userId);
      expect(articleResponse.body.article.status).toBe('draft');
      expect(articleResponse.body.article.title).toBe(articleData.title);

      // Step 5: Publish the article
      const publishResponse = await request(app)
        .post(`/api/articles/${articleResponse.body.article.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: null })
        .expect(200);

      expect(publishResponse.body.success).toBe(true);
      expect(publishResponse.body.article.status).toBe('published');
      expect(publishResponse.body.article.published_at).not.toBeNull();

      // Step 6: Verify analytics are initialized
      const analyticsResponse = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.overview.articles_published).toBe(1);
      expect(analyticsResponse.body.overview.total_revenue).toBe(0);

      // Step 7: Verify published content is visible
      const publicArticlesResponse = await request(app)
        .get('/api/articles')
        .expect(200);

      expect(publicArticlesResponse.body.success).toBe(true);
      const publishedArticle = publicArticlesResponse.body.articles.find(
        (article: any) => article.id === articleResponse.body.article.id
      );
      expect(publishedArticle).toBeDefined();
      expect(publishedArticle.status).toBe('published');
    });

    it('should handle creator registration with validation errors', async () => {
      // Test email validation
      const invalidEmailData = {
        email: 'invalid-email',
        password: 'SecurePass123',
        name: 'Test Creator',
        role: 'creator'
      };

      await request(app)
        .post('/api/auth/register')
        .send(invalidEmailData)
        .expect(400);

      // Test password strength
      const weakPasswordData = {
        email: 'weakpass@example.com',
        password: '123',
        name: 'Test Creator',
        role: 'creator'
      };

      await request(app)
        .post('/api/auth/register')
        .send(weakPasswordData)
        .expect(400);

      // Test duplicate email
      const validData = {
        email: 'duplicate@example.com',
        password: 'SecurePass123',
        name: 'Test Creator',
        role: 'creator'
      };

      await request(app)
        .post('/api/auth/register')
        .send(validData)
        .expect(201);

      await request(app)
        .post('/api/auth/register')
        .send(validData)
        .expect(400);
    });
  });
});