import { Pool } from 'pg';
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
export declare class Article {
    private pool;
    constructor(pool: Pool);
    create(articleData: CreateArticleData): Promise<ArticleData>;
    findById(id: string): Promise<ArticleData | null>;
    findBySlug(authorId: string, slug: string): Promise<ArticleData | null>;
    findMany(filters?: ArticleFilters): Promise<{
        articles: ArticleData[];
        total: number;
    }>;
    update(id: string, updateData: UpdateArticleData): Promise<ArticleData | null>;
    publish(id: string, scheduledAt?: Date): Promise<ArticleData | null>;
    archive(id: string): Promise<ArticleData | null>;
    delete(id: string): Promise<boolean>;
    private generateSlug;
    private calculateReadingTime;
    static validateTitle(title: string): boolean;
    static validateContent(content: string): boolean;
    static validateTags(tags: string[]): boolean;
    static validateSeoDescription(description: string): boolean;
}
//# sourceMappingURL=Article.d.ts.map