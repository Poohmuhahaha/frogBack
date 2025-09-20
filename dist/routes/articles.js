"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArticlesRouter = createArticlesRouter;
const express_1 = require("express");
const ArticleService_1 = require("../services/ArticleService");
const Article_1 = require("../models/Article");
function createArticlesRouter(pool) {
    const router = (0, express_1.Router)();
    const articleService = new ArticleService_1.ArticleService(pool);
    // Middleware to authenticate JWT tokens (would be imported from auth routes in real app)
    const authenticateToken = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Access token required' });
            }
            const token = authHeader.substring(7);
            // In a real implementation, this would verify the JWT token
            // For now, we'll simulate a user object
            req.user = { id: 'user-id', role: 'creator' };
            next();
        }
        catch (error) {
            res.status(401).json({ error: 'Invalid token' });
        }
    };
    // Optional authentication middleware
    const optionalAuth = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                // Set user if token is valid, but don't fail if not
                req.user = { id: 'user-id', role: 'creator' };
            }
            next();
        }
        catch (error) {
            // Continue without authentication
            next();
        }
    };
    // GET /api/articles - List articles with filtering and pagination
    router.get('/', optionalAuth, async (req, res) => {
        try {
            const { author_id, status = 'published', is_premium, tags, search, limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
            // Parse query parameters
            const filters = {
                limit: Math.min(parseInt(limit) || 20, 100), // Max 100 items
                offset: parseInt(offset) || 0
            };
            if (author_id)
                filters.author_id = author_id;
            if (status)
                filters.status = status;
            if (is_premium !== undefined)
                filters.is_premium = is_premium === 'true';
            if (search)
                filters.search = search;
            if (tags) {
                const tagArray = Array.isArray(tags) ? tags : [tags];
                filters.tags = tagArray;
            }
            // Only allow access to drafts if user is the author
            if (filters.status === 'draft' && (!req.user || !filters.author_id || req.user.id !== filters.author_id)) {
                filters.status = 'published';
            }
            const result = await articleService.getArticles(filters);
            res.json({
                articles: result.articles,
                total: result.total,
                limit: filters.limit,
                offset: filters.offset
            });
        }
        catch (error) {
            console.error('Get articles error:', error);
            res.status(500).json({ error: 'Failed to fetch articles' });
        }
    });
    // GET /api/articles/:id - Get article by ID
    router.get('/:id', optionalAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const { includeAnalytics = false } = req.query;
            const article = await articleService.getArticle(id, includeAnalytics === 'true');
            if (!article) {
                return res.status(404).json({ error: 'Article not found' });
            }
            // Check if user can access this article
            if (article.status === 'draft' && (!req.user || req.user.id !== article.author_id)) {
                return res.status(404).json({ error: 'Article not found' });
            }
            if (article.is_premium && !req.user) {
                // Return preview for premium content
                const preview = {
                    ...article,
                    content: article.content.substring(0, 500) + '...',
                    is_preview: true
                };
                return res.json({ article: preview });
            }
            res.json({ article });
        }
        catch (error) {
            console.error('Get article error:', error);
            res.status(500).json({ error: 'Failed to fetch article' });
        }
    });
    // GET /api/articles/slug/:slug - Get article by slug
    router.get('/slug/:slug', optionalAuth, async (req, res) => {
        try {
            const { slug } = req.params;
            const { author_id } = req.query;
            if (!author_id) {
                return res.status(400).json({ error: 'Author ID is required' });
            }
            const article = await articleService.getArticleBySlug(author_id, slug);
            if (!article) {
                return res.status(404).json({ error: 'Article not found' });
            }
            // Check access permissions
            if (article.status === 'draft' && (!req.user || req.user.id !== article.author_id)) {
                return res.status(404).json({ error: 'Article not found' });
            }
            if (article.is_premium && !req.user) {
                const preview = {
                    ...article,
                    content: article.content.substring(0, 500) + '...',
                    is_preview: true
                };
                return res.json({ article: preview });
            }
            res.json({ article });
        }
        catch (error) {
            console.error('Get article by slug error:', error);
            res.status(500).json({ error: 'Failed to fetch article' });
        }
    });
    // POST /api/articles - Create new article
    router.post('/', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { title, content, excerpt, featured_image_url, is_premium = false, seo_title, seo_description, tags = [] } = req.body;
            // Validate required fields
            if (!title || !content) {
                return res.status(400).json({
                    error: 'Title and content are required'
                });
            }
            // Validate field lengths
            if (!Article_1.Article.validateTitle(title)) {
                return res.status(400).json({
                    error: 'Title must be 1-200 characters'
                });
            }
            if (!Article_1.Article.validateContent(content)) {
                return res.status(400).json({
                    error: 'Content must be 1-100,000 characters'
                });
            }
            if (tags && !Article_1.Article.validateTags(tags)) {
                return res.status(400).json({
                    error: 'Maximum 10 tags allowed, each 1-50 characters'
                });
            }
            if (seo_description && !Article_1.Article.validateSeoDescription(seo_description)) {
                return res.status(400).json({
                    error: 'SEO description must be maximum 300 characters'
                });
            }
            const articleData = {
                author_id: req.user.id,
                title: title.trim(),
                content,
                excerpt: excerpt?.trim(),
                featured_image_url: featured_image_url?.trim(),
                is_premium: Boolean(is_premium),
                seo_title: seo_title?.trim(),
                seo_description: seo_description?.trim(),
                tags: Array.isArray(tags) ? tags : []
            };
            const article = await articleService.createArticle(articleData);
            res.status(201).json({
                message: 'Article created successfully',
                article
            });
        }
        catch (error) {
            console.error('Create article error:', error);
            const message = error instanceof Error ? error.message : 'Failed to create article';
            res.status(500).json({ error: message });
        }
    });
    // PUT /api/articles/:id - Update article
    router.put('/:id', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { id } = req.params;
            const { title, content, excerpt, featured_image_url, is_premium, seo_title, seo_description, tags } = req.body;
            // Build update data object
            const updateData = {};
            if (title !== undefined)
                updateData.title = title.trim();
            if (content !== undefined)
                updateData.content = content;
            if (excerpt !== undefined)
                updateData.excerpt = excerpt?.trim();
            if (featured_image_url !== undefined)
                updateData.featured_image_url = featured_image_url?.trim();
            if (is_premium !== undefined)
                updateData.is_premium = Boolean(is_premium);
            if (seo_title !== undefined)
                updateData.seo_title = seo_title?.trim();
            if (seo_description !== undefined)
                updateData.seo_description = seo_description?.trim();
            if (tags !== undefined)
                updateData.tags = Array.isArray(tags) ? tags : [];
            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }
            const article = await articleService.updateArticle(id, updateData, req.user.id);
            res.json({
                message: 'Article updated successfully',
                article
            });
        }
        catch (error) {
            console.error('Update article error:', error);
            const message = error instanceof Error ? error.message : 'Failed to update article';
            if (message.includes('not found')) {
                return res.status(404).json({ error: message });
            }
            if (message.includes('Unauthorized')) {
                return res.status(403).json({ error: message });
            }
            res.status(500).json({ error: message });
        }
    });
    // POST /api/articles/:id/publish - Publish article
    router.post('/:id/publish', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { id } = req.params;
            const { scheduledAt, notify_subscribers = false, social_auto_post = false } = req.body;
            const publishOptions = {
                notify_subscribers: Boolean(notify_subscribers),
                social_auto_post: Boolean(social_auto_post)
            };
            if (scheduledAt) {
                publishOptions.scheduledAt = new Date(scheduledAt);
            }
            const article = await articleService.publishArticle(id, publishOptions, req.user.id);
            res.json({
                message: 'Article published successfully',
                article
            });
        }
        catch (error) {
            console.error('Publish article error:', error);
            const message = error instanceof Error ? error.message : 'Failed to publish article';
            if (message.includes('not found')) {
                return res.status(404).json({ error: message });
            }
            if (message.includes('Unauthorized')) {
                return res.status(403).json({ error: message });
            }
            if (message.includes('already published')) {
                return res.status(400).json({ error: message });
            }
            res.status(500).json({ error: message });
        }
    });
    // POST /api/articles/:id/archive - Archive article
    router.post('/:id/archive', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { id } = req.params;
            const article = await articleService.archiveArticle(id, req.user.id);
            res.json({
                message: 'Article archived successfully',
                article
            });
        }
        catch (error) {
            console.error('Archive article error:', error);
            const message = error instanceof Error ? error.message : 'Failed to archive article';
            if (message.includes('not found')) {
                return res.status(404).json({ error: message });
            }
            if (message.includes('Unauthorized')) {
                return res.status(403).json({ error: message });
            }
            res.status(500).json({ error: message });
        }
    });
    // DELETE /api/articles/:id - Delete article
    router.delete('/:id', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { id } = req.params;
            await articleService.deleteArticle(id, req.user.id);
            res.json({
                message: 'Article deleted successfully'
            });
        }
        catch (error) {
            console.error('Delete article error:', error);
            const message = error instanceof Error ? error.message : 'Failed to delete article';
            if (message.includes('not found')) {
                return res.status(404).json({ error: message });
            }
            if (message.includes('Unauthorized')) {
                return res.status(403).json({ error: message });
            }
            res.status(500).json({ error: message });
        }
    });
    // GET /api/articles/:id/related - Get related articles
    router.get('/:id/related', async (req, res) => {
        try {
            const { id } = req.params;
            const { limit = 5 } = req.query;
            const relatedArticles = await articleService.getRelatedArticles(id, parseInt(limit) || 5);
            res.json({
                related: relatedArticles
            });
        }
        catch (error) {
            console.error('Get related articles error:', error);
            res.status(500).json({ error: 'Failed to fetch related articles' });
        }
    });
    // GET /api/articles/search/:term - Search articles
    router.get('/search/:term', async (req, res) => {
        try {
            const { term } = req.params;
            const { limit = 20, offset = 0, author_id, tags } = req.query;
            const searchOptions = {
                limit: Math.min(parseInt(limit) || 20, 100),
                offset: parseInt(offset) || 0,
                status: 'published' // Only search published articles
            };
            if (author_id)
                searchOptions.author_id = author_id;
            if (tags) {
                const tagArray = Array.isArray(tags) ? tags : [tags];
                searchOptions.tags = tagArray;
            }
            const result = await articleService.searchArticles(term, searchOptions);
            res.json({
                articles: result.articles,
                total: result.total,
                searchTerm: term,
                limit: searchOptions.limit,
                offset: searchOptions.offset
            });
        }
        catch (error) {
            console.error('Search articles error:', error);
            res.status(500).json({ error: 'Failed to search articles' });
        }
    });
    // GET /api/articles/stats/counts - Get article counts for user
    router.get('/stats/counts', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const [draftCount, publishedCount] = await Promise.all([
                articleService.getDraftCount(req.user.id),
                articleService.getPublishedCount(req.user.id)
            ]);
            res.json({
                drafts: draftCount,
                published: publishedCount,
                total: draftCount + publishedCount
            });
        }
        catch (error) {
            console.error('Get article stats error:', error);
            res.status(500).json({ error: 'Failed to get article statistics' });
        }
    });
    return router;
}
//# sourceMappingURL=articles.js.map