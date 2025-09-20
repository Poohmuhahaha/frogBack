import { Pool } from 'pg';
import { Article, ArticleData, CreateArticleData, UpdateArticleData, ArticleFilters } from '../models/Article';

export interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface ArticleWithSEO extends ArticleData {
  seo: SEOData;
}

export interface PublishOptions {
  scheduledAt?: Date;
  notify_subscribers?: boolean;
  social_auto_post?: boolean;
}

export interface ArticleSearchOptions extends ArticleFilters {
  sortBy?: 'created_at' | 'published_at' | 'title' | 'reading_time';
  sortOrder?: 'asc' | 'desc';
  includeAnalytics?: boolean;
}

export interface RelatedArticle {
  id: string;
  title: string;
  excerpt: string;
  slug: string;
  reading_time: number;
  published_at: Date;
}

export class ArticleService {
  private article: Article;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.article = new Article(pool);
  }

  async createArticle(articleData: CreateArticleData): Promise<ArticleWithSEO> {
    // Validate input data
    if (!Article.validateTitle(articleData.title)) {
      throw new Error('Invalid title: must be 1-200 characters');
    }

    if (!Article.validateContent(articleData.content)) {
      throw new Error('Invalid content: must be 1-100,000 characters');
    }

    if (articleData.tags && !Article.validateTags(articleData.tags)) {
      throw new Error('Invalid tags: maximum 10 tags, each 1-50 characters');
    }

    if (articleData.seo_description && !Article.validateSeoDescription(articleData.seo_description)) {
      throw new Error('Invalid SEO description: maximum 300 characters');
    }

    // Auto-generate SEO data if not provided
    const seoData = this.generateSEOData(articleData);
    const articleWithSEO = {
      ...articleData,
      seo_title: articleData.seo_title || seoData.title,
      seo_description: articleData.seo_description || seoData.description,
      excerpt: articleData.excerpt || this.generateExcerpt(articleData.content)
    };

    // Create article
    const newArticle = await this.article.create(articleWithSEO);

    return this.enrichWithSEO(newArticle);
  }

  async updateArticle(id: string, updateData: UpdateArticleData, authorId?: string): Promise<ArticleWithSEO> {
    // Verify article exists and user has permission
    const existingArticle = await this.article.findById(id);
    if (!existingArticle) {
      throw new Error('Article not found');
    }

    if (authorId && existingArticle.author_id !== authorId) {
      throw new Error('Unauthorized: You can only edit your own articles');
    }

    // Validate update data
    if (updateData.title && !Article.validateTitle(updateData.title)) {
      throw new Error('Invalid title: must be 1-200 characters');
    }

    if (updateData.content && !Article.validateContent(updateData.content)) {
      throw new Error('Invalid content: must be 1-100,000 characters');
    }

    if (updateData.tags && !Article.validateTags(updateData.tags)) {
      throw new Error('Invalid tags: maximum 10 tags, each 1-50 characters');
    }

    if (updateData.seo_description && !Article.validateSeoDescription(updateData.seo_description)) {
      throw new Error('Invalid SEO description: maximum 300 characters');
    }

    // Auto-generate SEO data for updated content
    if (updateData.title || updateData.content) {
      const seoData = this.generateSEOData({
        title: updateData.title || existingArticle.title,
        content: updateData.content || existingArticle.content,
        tags: updateData.tags || existingArticle.tags
      } as CreateArticleData);

      updateData.seo_title = updateData.seo_title || seoData.title;
      updateData.seo_description = updateData.seo_description || seoData.description;
    }

    // Update excerpt if content changed
    if (updateData.content && !updateData.excerpt) {
      updateData.excerpt = this.generateExcerpt(updateData.content);
    }

    const updatedArticle = await this.article.update(id, updateData);
    if (!updatedArticle) {
      throw new Error('Article not found');
    }

    return this.enrichWithSEO(updatedArticle);
  }

  async getArticle(id: string, includeAnalytics = false): Promise<ArticleWithSEO | null> {
    const article = await this.article.findById(id);
    if (!article) {
      return null;
    }

    const enrichedArticle = this.enrichWithSEO(article);

    if (includeAnalytics) {
      // Add analytics data if requested
      const analytics = await this.getArticleAnalytics(id);
      (enrichedArticle as any).analytics = analytics;
    }

    return enrichedArticle;
  }

  async getArticleBySlug(authorId: string, slug: string): Promise<ArticleWithSEO | null> {
    const article = await this.article.findBySlug(authorId, slug);
    if (!article) {
      return null;
    }

    return this.enrichWithSEO(article);
  }

  async getArticles(options: ArticleSearchOptions = {}): Promise<{ articles: ArticleWithSEO[]; total: number }> {
    const { articles, total } = await this.article.findMany(options);

    const enrichedArticles = articles.map(article => this.enrichWithSEO(article));

    return { articles: enrichedArticles, total };
  }

  async publishArticle(id: string, options: PublishOptions = {}, authorId?: string): Promise<ArticleWithSEO> {
    // Verify article exists and user has permission
    const existingArticle = await this.article.findById(id);
    if (!existingArticle) {
      throw new Error('Article not found');
    }

    if (authorId && existingArticle.author_id !== authorId) {
      throw new Error('Unauthorized: You can only publish your own articles');
    }

    if (existingArticle.status === 'published') {
      throw new Error('Article is already published');
    }

    // Validate article is ready for publishing
    if (!existingArticle.title || !existingArticle.content) {
      throw new Error('Article must have title and content to be published');
    }

    // Publish article
    const publishedArticle = await this.article.publish(id, options.scheduledAt);
    if (!publishedArticle) {
      throw new Error('Failed to publish article');
    }

    // TODO: Handle notification and social posting options
    if (options.notify_subscribers) {
      // Add to newsletter queue
      console.log('TODO: Add article to newsletter queue');
    }

    if (options.social_auto_post) {
      // Schedule social media posts
      console.log('TODO: Schedule social media posts');
    }

    return this.enrichWithSEO(publishedArticle);
  }

  async archiveArticle(id: string, authorId?: string): Promise<ArticleWithSEO> {
    // Verify article exists and user has permission
    const existingArticle = await this.article.findById(id);
    if (!existingArticle) {
      throw new Error('Article not found');
    }

    if (authorId && existingArticle.author_id !== authorId) {
      throw new Error('Unauthorized: You can only archive your own articles');
    }

    const archivedArticle = await this.article.archive(id);
    if (!archivedArticle) {
      throw new Error('Failed to archive article');
    }

    return this.enrichWithSEO(archivedArticle);
  }

  async deleteArticle(id: string, authorId?: string): Promise<void> {
    // Verify article exists and user has permission
    const existingArticle = await this.article.findById(id);
    if (!existingArticle) {
      throw new Error('Article not found');
    }

    if (authorId && existingArticle.author_id !== authorId) {
      throw new Error('Unauthorized: You can only delete your own articles');
    }

    const deleted = await this.article.delete(id);
    if (!deleted) {
      throw new Error('Failed to delete article');
    }
  }

  async getRelatedArticles(articleId: string, limit = 5): Promise<RelatedArticle[]> {
    const article = await this.article.findById(articleId);
    if (!article) {
      return [];
    }

    // Find related articles based on tags and author
    const query = `
      SELECT id, title, excerpt, slug, reading_time, published_at
      FROM articles
      WHERE id != $1
        AND author_id = $2
        AND status = 'published'
        AND (tags @> $3 OR tags && $3)
      ORDER BY published_at DESC
      LIMIT $4
    `;

    const result = await this.pool.query(query, [
      articleId,
      article.author_id,
      JSON.stringify(article.tags || []),
      limit
    ]);

    return result.rows;
  }

  async searchArticles(searchTerm: string, options: ArticleSearchOptions = {}): Promise<{ articles: ArticleWithSEO[]; total: number }> {
    const searchOptions = {
      ...options,
      search: searchTerm
    };

    return this.getArticles(searchOptions);
  }

  async getDraftCount(authorId: string): Promise<number> {
    const query = 'SELECT COUNT(*) FROM articles WHERE author_id = $1 AND status = $2';
    const result = await this.pool.query(query, [authorId, 'draft']);
    return parseInt(result.rows[0].count);
  }

  async getPublishedCount(authorId: string): Promise<number> {
    const query = 'SELECT COUNT(*) FROM articles WHERE author_id = $1 AND status = $2';
    const result = await this.pool.query(query, [authorId, 'published']);
    return parseInt(result.rows[0].count);
  }

  // SEO and optimization methods
  private generateSEOData(articleData: Partial<CreateArticleData>): SEOData {
    const title = articleData.title || '';
    const content = articleData.content || '';
    const tags = articleData.tags || [];

    // Generate SEO title (60 characters max)
    const seoTitle = title.length <= 60 ? title : title.substring(0, 57) + '...';

    // Generate meta description (160 characters max)
    const excerpt = this.generateExcerpt(content, 160);

    // Generate keywords from tags and content
    const keywords = [...tags];
    if (keywords.length < 5) {
      // Extract additional keywords from content
      const contentWords = content
        .replace(/<[^>]*>/g, '') // Remove HTML
        .toLowerCase()
        .match(/\b\w{4,}\b/g) || []; // Words 4+ characters

      const wordFreq = contentWords.reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topWords = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5 - keywords.length)
        .map(([word]) => word);

      keywords.push(...topWords);
    }

    return {
      title: seoTitle,
      description: excerpt,
      keywords: keywords.slice(0, 10), // Max 10 keywords
      ogTitle: seoTitle,
      ogDescription: excerpt
    };
  }

  private generateExcerpt(content: string, maxLength = 200): string {
    // Remove HTML tags
    const plainText = content.replace(/<[^>]*>/g, '');

    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Find the last complete sentence within the limit
    const truncated = plainText.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSentence > maxLength * 0.7) {
      return plainText.substring(0, lastSentence + 1);
    } else if (lastSpace > maxLength * 0.8) {
      return plainText.substring(0, lastSpace) + '...';
    } else {
      return truncated + '...';
    }
  }

  private enrichWithSEO(article: ArticleData): ArticleWithSEO {
    const seo: SEOData = {
      title: article.seo_title || article.title,
      description: article.seo_description || article.excerpt || '',
      keywords: article.tags || [],
      ogTitle: article.seo_title || article.title,
      ogDescription: article.seo_description || article.excerpt || '',
      ogImage: article.featured_image_url
    };

    return {
      ...article,
      seo
    };
  }

  private async getArticleAnalytics(articleId: string): Promise<any> {
    // Get latest analytics data for the article
    const query = `
      SELECT
        COALESCE(SUM(page_views), 0) as total_views,
        COALESCE(SUM(unique_visitors), 0) as total_unique_visitors,
        COALESCE(AVG(avg_time_on_page), 0) as avg_time_on_page,
        COALESCE(AVG(bounce_rate), 0) as avg_bounce_rate,
        COALESCE(SUM(social_shares), 0) as total_social_shares,
        COALESCE(SUM(ad_revenue), 0) as total_ad_revenue,
        COALESCE(SUM(affiliate_clicks), 0) as total_affiliate_clicks,
        COALESCE(SUM(newsletter_signups), 0) as total_newsletter_signups
      FROM article_analytics
      WHERE article_id = $1
    `;

    const result = await this.pool.query(query, [articleId]);
    return result.rows[0] || {};
  }

  // URL and slug utilities
  static generateSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 100);
  }

  static validateSlug(slug: string): boolean {
    const slugRegex = /^[a-z0-9-]+$/;
    return slugRegex.test(slug) && slug.length > 0 && slug.length <= 100;
  }
}