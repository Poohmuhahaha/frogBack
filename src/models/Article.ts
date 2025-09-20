import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface ArticleData {
  id?: string;
  author_id: string;
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  status: 'draft' | 'published' | 'archived';
  is_premium?: boolean;
  seo_title?: string;
  seo_description?: string;
  tags?: string[];
  reading_time?: number;
  published_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateArticleData {
  author_id: string;
  title: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  is_premium?: boolean;
  seo_title?: string;
  seo_description?: string;
  tags?: string[];
}

export interface UpdateArticleData {
  title?: string;
  content?: string;
  excerpt?: string;
  featured_image_url?: string;
  is_premium?: boolean;
  seo_title?: string;
  seo_description?: string;
  tags?: string[];
}

export interface ArticleFilters {
  author_id?: string;
  status?: 'draft' | 'published' | 'archived';
  is_premium?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  search?: string;
}

export class Article {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(articleData: CreateArticleData): Promise<ArticleData> {
    const id = uuidv4();
    const slug = this.generateSlug(articleData.title);
    const reading_time = this.calculateReadingTime(articleData.content);
    const now = new Date();

    const query = `
      INSERT INTO articles (
        id, author_id, title, slug, content, excerpt, featured_image_url,
        status, is_premium, seo_title, seo_description, tags, reading_time,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      id,
      articleData.author_id,
      articleData.title,
      slug,
      articleData.content,
      articleData.excerpt || null,
      articleData.featured_image_url || null,
      'draft', // Default status
      articleData.is_premium || false,
      articleData.seo_title || null,
      articleData.seo_description || null,
      articleData.tags || [],
      reading_time,
      now,
      now
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<ArticleData | null> {
    const query = 'SELECT * FROM articles WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findBySlug(authorId: string, slug: string): Promise<ArticleData | null> {
    const query = 'SELECT * FROM articles WHERE author_id = $1 AND slug = $2';
    const result = await this.pool.query(query, [authorId, slug]);
    return result.rows[0] || null;
  }

  async findMany(filters: ArticleFilters = {}): Promise<{ articles: ArticleData[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    // Build WHERE clause dynamically
    if (filters.author_id) {
      paramCount++;
      whereClause += ` AND author_id = $${paramCount}`;
      values.push(filters.author_id);
    }

    if (filters.status) {
      paramCount++;
      whereClause += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }

    if (filters.is_premium !== undefined) {
      paramCount++;
      whereClause += ` AND is_premium = $${paramCount}`;
      values.push(filters.is_premium);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      whereClause += ` AND tags @> $${paramCount}`;
      values.push(JSON.stringify(filters.tags));
    }

    if (filters.search) {
      paramCount++;
      whereClause += ` AND (title ILIKE $${paramCount} OR content ILIKE $${paramCount} OR excerpt ILIKE $${paramCount})`;
      values.push(`%${filters.search}%`);
    }

    // Count total results
    const countQuery = `SELECT COUNT(*) FROM articles ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    let query = `SELECT * FROM articles ${whereClause} ORDER BY created_at DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await this.pool.query(query, values);
    return { articles: result.rows, total };
  }

  async update(id: string, updateData: UpdateArticleData): Promise<ArticleData | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'title') {
          // Update slug when title changes
          fields.push(`title = $${paramCount}`);
          fields.push(`slug = $${paramCount + 1}`);
          values.push(value);
          values.push(this.generateSlug(value as string));
          paramCount += 2;
        } else if (key === 'content') {
          // Recalculate reading time when content changes
          fields.push(`content = $${paramCount}`);
          fields.push(`reading_time = $${paramCount + 1}`);
          values.push(value);
          values.push(this.calculateReadingTime(value as string));
          paramCount += 2;
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const query = `
      UPDATE articles
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async publish(id: string, scheduledAt?: Date): Promise<ArticleData | null> {
    const publishedAt = scheduledAt || new Date();
    const query = `
      UPDATE articles
      SET status = 'published', published_at = $1, updated_at = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await this.pool.query(query, [publishedAt, new Date(), id]);
    return result.rows[0] || null;
  }

  async archive(id: string): Promise<ArticleData | null> {
    const query = `
      UPDATE articles
      SET status = 'archived', updated_at = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [new Date(), id]);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM articles WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Utility methods
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim()
      .substring(0, 100); // Limit length
  }

  private calculateReadingTime(content: string): number {
    // Remove HTML tags and count words
    const plainText = content.replace(/<[^>]*>/g, '');
    const wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;

    // Average reading speed is 200-250 words per minute
    const wordsPerMinute = 225;
    const readingTime = Math.ceil(wordCount / wordsPerMinute);

    return Math.max(1, readingTime); // Minimum 1 minute
  }

  // Validation methods
  static validateTitle(title: string): boolean {
    return title.length > 0 && title.length <= 200;
  }

  static validateContent(content: string): boolean {
    return content.length > 0 && content.length <= 100000; // Max 100k characters
  }

  static validateTags(tags: string[]): boolean {
    if (tags.length > 10) return false; // Max 10 tags
    return tags.every(tag => tag.length > 0 && tag.length <= 50);
  }

  static validateSeoDescription(description: string): boolean {
    return description.length <= 300;
  }
}