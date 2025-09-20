import { Pool } from 'pg';
import { ArticleData, CreateArticleData, UpdateArticleData, ArticleFilters } from '../models/Article';
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
export declare class ArticleService {
    private article;
    private pool;
    constructor(pool: Pool);
    createArticle(articleData: CreateArticleData): Promise<ArticleWithSEO>;
    updateArticle(id: string, updateData: UpdateArticleData, authorId?: string): Promise<ArticleWithSEO>;
    getArticle(id: string, includeAnalytics?: boolean): Promise<ArticleWithSEO | null>;
    getArticleBySlug(authorId: string, slug: string): Promise<ArticleWithSEO | null>;
    getArticles(options?: ArticleSearchOptions): Promise<{
        articles: ArticleWithSEO[];
        total: number;
    }>;
    publishArticle(id: string, options?: PublishOptions, authorId?: string): Promise<ArticleWithSEO>;
    archiveArticle(id: string, authorId?: string): Promise<ArticleWithSEO>;
    deleteArticle(id: string, authorId?: string): Promise<void>;
    getRelatedArticles(articleId: string, limit?: number): Promise<RelatedArticle[]>;
    searchArticles(searchTerm: string, options?: ArticleSearchOptions): Promise<{
        articles: ArticleWithSEO[];
        total: number;
    }>;
    getDraftCount(authorId: string): Promise<number>;
    getPublishedCount(authorId: string): Promise<number>;
    private generateSEOData;
    private generateExcerpt;
    private enrichWithSEO;
    private getArticleAnalytics;
    static generateSlugFromTitle(title: string): string;
    static validateSlug(slug: string): boolean;
}
//# sourceMappingURL=ArticleService.d.ts.map