import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ArticleService } from '../../../src/services/ArticleService';
import database from '../../../src/database/connection';

jest.mock('../../../src/database/connection');

const mockDatabase = database as jest.Mocked<typeof database>;

describe('ArticleService', () => {
  let articleService: ArticleService;

  beforeEach(() => {
    articleService = new ArticleService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createArticle', () => {
    const mockArticleData = {
      title: 'Test Article',
      content: 'This is test content',
      excerpt: 'Test excerpt',
      slug: 'test-article',
      authorId: 'author_123',
      tags: ['test', 'article'],
      category: 'Technology',
      isPremium: false,
      seoTitle: 'Test Article - SEO Title',
      seoDescription: 'Test article SEO description'
    };

    const mockCreatedArticle = {
      id: 'article_123',
      ...mockArticleData,
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should successfully create a new article', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // Check slug uniqueness
        .mockResolvedValueOnce({ rows: [mockCreatedArticle] }); // Insert article

      const result = await articleService.createArticle(mockArticleData);

      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM articles WHERE slug = $1'),
        [mockArticleData.slug]
      );
      expect(result).toEqual(mockCreatedArticle);
    });

    it('should throw error for duplicate slug', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: 'existing_article' }]
      });

      await expect(articleService.createArticle(mockArticleData)).rejects.toThrow('Article with this slug already exists');
    });

    it('should generate slug from title if not provided', async () => {
      const dataWithoutSlug = { ...mockArticleData };
      delete dataWithoutSlug.slug;

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // Check generated slug
        .mockResolvedValueOnce({ rows: [mockCreatedArticle] }); // Insert article

      await articleService.createArticle(dataWithoutSlug);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM articles WHERE slug = $1'),
        ['test-article'] // Generated from title
      );
    });

    it('should validate required fields', async () => {
      const invalidData = { ...mockArticleData };
      delete invalidData.title;

      await expect(articleService.createArticle(invalidData)).rejects.toThrow('Title is required');
    });
  });

  describe('getArticleById', () => {
    const articleId = 'article_123';
    const mockArticle = {
      id: articleId,
      title: 'Test Article',
      content: 'Test content',
      slug: 'test-article',
      author_id: 'author_123',
      author_name: 'John Doe',
      status: 'published',
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should successfully retrieve article by ID', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockArticle] });

      const result = await articleService.getArticleById(articleId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT a.*, u.name as author_name'),
        [articleId]
      );
      expect(result).toEqual(mockArticle);
    });

    it('should throw error for non-existent article', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(articleService.getArticleById(articleId)).rejects.toThrow('Article not found');
    });
  });

  describe('getArticleBySlug', () => {
    const slug = 'test-article';
    const mockArticle = {
      id: 'article_123',
      title: 'Test Article',
      content: 'Test content',
      slug: slug,
      author_id: 'author_123',
      author_name: 'John Doe',
      status: 'published'
    };

    it('should successfully retrieve article by slug', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockArticle] });

      const result = await articleService.getArticleBySlug(slug);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.slug = $1'),
        [slug]
      );
      expect(result).toEqual(mockArticle);
    });

    it('should throw error for non-existent slug', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(articleService.getArticleBySlug(slug)).rejects.toThrow('Article not found');
    });
  });

  describe('updateArticle', () => {
    const articleId = 'article_123';
    const updateData = {
      title: 'Updated Title',
      content: 'Updated content',
      status: 'published' as const
    };

    const mockUpdatedArticle = {
      id: articleId,
      ...updateData,
      updated_at: new Date()
    };

    it('should successfully update article', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: articleId }] }) // Check article exists
        .mockResolvedValueOnce({ rows: [mockUpdatedArticle] }); // Update article

      const result = await articleService.updateArticle(articleId, updateData);

      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUpdatedArticle);
    });

    it('should throw error for non-existent article', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(articleService.updateArticle(articleId, updateData)).rejects.toThrow('Article not found');
    });

    it('should validate slug uniqueness when updating slug', async () => {
      const updateWithSlug = { ...updateData, slug: 'new-slug' };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: articleId }] }) // Check article exists
        .mockResolvedValueOnce({ rows: [{ id: 'other_article' }] }); // Check slug uniqueness

      await expect(articleService.updateArticle(articleId, updateWithSlug)).rejects.toThrow('Article with this slug already exists');
    });
  });

  describe('deleteArticle', () => {
    const articleId = 'article_123';

    it('should successfully delete article', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: articleId }] }) // Check article exists
        .mockResolvedValueOnce({ rows: [] }); // Delete article

      await articleService.deleteArticle(articleId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM articles WHERE id = $1'),
        [articleId]
      );
    });

    it('should throw error for non-existent article', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(articleService.deleteArticle(articleId)).rejects.toThrow('Article not found');
    });
  });

  describe('getArticles', () => {
    const mockFilters = {
      authorId: 'author_123',
      status: 'published' as const,
      category: 'Technology',
      tags: ['test'],
      search: 'test query',
      page: 1,
      limit: 10
    };

    const mockArticles = [
      {
        id: 'article_1',
        title: 'Article 1',
        slug: 'article-1',
        author_name: 'John Doe',
        status: 'published',
        created_at: new Date()
      },
      {
        id: 'article_2',
        title: 'Article 2',
        slug: 'article-2',
        author_name: 'Jane Smith',
        status: 'published',
        created_at: new Date()
      }
    ];

    it('should successfully retrieve articles with filters', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockArticles }); // Articles query

      const result = await articleService.getArticles(mockFilters);

      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        articles: mockArticles,
        pagination: {
          total: 2,
          page: 1,
          limit: 10,
          pages: 1
        }
      });
    });

    it('should handle empty filters', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: mockArticles });

      const result = await articleService.getArticles({});

      expect(result.articles).toEqual(mockArticles);
      expect(result.pagination.total).toBe(5);
    });

    it('should apply search filter correctly', async () => {
      const searchFilters = { search: 'technology' };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockArticles[0]] });

      await articleService.getArticles(searchFilters);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining(['%technology%'])
      );
    });
  });

  describe('publishArticle', () => {
    const articleId = 'article_123';

    it('should successfully publish draft article', async () => {
      const mockArticle = {
        id: articleId,
        status: 'draft',
        title: 'Test Article'
      };

      const mockPublishedArticle = {
        ...mockArticle,
        status: 'published',
        published_at: new Date()
      };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockArticle] }) // Check article exists
        .mockResolvedValueOnce({ rows: [mockPublishedArticle] }); // Update to published

      const result = await articleService.publishArticle(articleId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE articles SET status = $1, published_at = NOW()'),
        ['published', articleId]
      );
      expect(result).toEqual(mockPublishedArticle);
    });

    it('should throw error for already published article', async () => {
      const mockPublishedArticle = {
        id: articleId,
        status: 'published'
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockPublishedArticle] });

      await expect(articleService.publishArticle(articleId)).rejects.toThrow('Article is already published');
    });

    it('should throw error for non-existent article', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(articleService.publishArticle(articleId)).rejects.toThrow('Article not found');
    });
  });

  describe('getArticleStats', () => {
    const articleId = 'article_123';

    it('should successfully retrieve article statistics', async () => {
      const mockStats = {
        views: 150,
        likes: 25,
        comments: 8,
        shares: 12
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockStats] });

      const result = await articleService.getArticleStats(articleId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [articleId]
      );
      expect(result).toEqual(mockStats);
    });
  });

  describe('incrementViewCount', () => {
    const articleId = 'article_123';

    it('should successfully increment view count', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await articleService.incrementViewCount(articleId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE article_analytics SET views = views + 1'),
        [articleId]
      );
    });
  });

  describe('getRelatedArticles', () => {
    const articleId = 'article_123';
    const mockRelatedArticles = [
      {
        id: 'related_1',
        title: 'Related Article 1',
        slug: 'related-1'
      },
      {
        id: 'related_2',
        title: 'Related Article 2',
        slug: 'related-2'
      }
    ];

    it('should successfully retrieve related articles', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: mockRelatedArticles });

      const result = await articleService.getRelatedArticles(articleId, 5);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [articleId, 5]
      );
      expect(result).toEqual(mockRelatedArticles);
    });
  });

  describe('generateSitemap', () => {
    const mockPublishedArticles = [
      {
        slug: 'article-1',
        updated_at: new Date('2023-01-01')
      },
      {
        slug: 'article-2',
        updated_at: new Date('2023-01-02')
      }
    ];

    it('should successfully generate sitemap URLs', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: mockPublishedArticles });

      const result = await articleService.generateSitemap();

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT slug, updated_at FROM articles WHERE status = $1'),
        ['published']
      );
      expect(result).toEqual(mockPublishedArticles);
    });
  });

  describe('searchArticles', () => {
    const searchQuery = 'javascript tutorial';
    const mockSearchResults = [
      {
        id: 'article_1',
        title: 'JavaScript Tutorial',
        slug: 'javascript-tutorial',
        excerpt: 'Learn JavaScript basics',
        relevance_score: 0.95
      }
    ];

    it('should successfully perform full-text search', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: mockSearchResults });

      const result = await articleService.searchArticles(searchQuery, 1, 10);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining([expect.stringContaining(searchQuery)])
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should handle empty search query', async () => {
      await expect(articleService.searchArticles('', 1, 10)).rejects.toThrow('Search query is required');
    });
  });
});