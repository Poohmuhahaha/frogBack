"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalyticsRouter = createAnalyticsRouter;
const express_1 = require("express");
const AnalyticsService_1 = require("../services/AnalyticsService");
const SubscriptionService_1 = require("../services/SubscriptionService");
const EmailService_1 = require("../services/EmailService");
function createAnalyticsRouter(pool) {
    const router = (0, express_1.Router)();
    // Initialize services
    const subscriptionService = new SubscriptionService_1.SubscriptionService(pool);
    const emailService = new EmailService_1.EmailService(pool);
    const analyticsService = new AnalyticsService_1.AnalyticsService(pool, subscriptionService, emailService);
    // Middleware to authenticate JWT tokens
    const authenticateToken = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Access token required' });
            }
            const token = authHeader.substring(7);
            // In a real implementation, this would verify the JWT token
            req.user = { id: 'user-id', role: 'creator' };
            next();
        }
        catch (error) {
            res.status(401).json({ error: 'Invalid token' });
        }
    };
    // Helper function to parse timeframe query parameter
    const parseTimeframe = (req) => {
        const { period = '30d', comparison } = req.query;
        const validPeriods = ['7d', '30d', '90d', '1y', 'all'];
        const validPeriod = validPeriods.includes(period) ? period : '30d';
        const timeframe = { period: validPeriod };
        if (comparison && validPeriods.includes(comparison)) {
            timeframe.comparison = comparison;
        }
        return timeframe;
    };
    // GET /api/analytics/overview - Dashboard overview
    router.get('/overview', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const timeframe = parseTimeframe(req);
            const overview = await analyticsService.getDashboardOverview(req.user.id, timeframe);
            res.json({
                overview,
                timeframe
            });
        }
        catch (error) {
            console.error('Get analytics overview error:', error);
            res.status(500).json({ error: 'Failed to fetch analytics overview' });
        }
    });
    // GET /api/analytics/revenue - Revenue analytics
    router.get('/revenue', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const timeframe = parseTimeframe(req);
            const revenue = await analyticsService.getRevenueAnalytics(req.user.id, timeframe);
            res.json({
                revenue,
                timeframe
            });
        }
        catch (error) {
            console.error('Get revenue analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch revenue analytics' });
        }
    });
    // GET /api/analytics/traffic - Traffic analytics
    router.get('/traffic', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const timeframe = parseTimeframe(req);
            const traffic = await analyticsService.getTrafficAnalytics(req.user.id, timeframe);
            res.json({
                traffic,
                timeframe
            });
        }
        catch (error) {
            console.error('Get traffic analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch traffic analytics' });
        }
    });
    // GET /api/analytics/engagement - Engagement analytics
    router.get('/engagement', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const timeframe = parseTimeframe(req);
            const engagement = await analyticsService.getEngagementAnalytics(req.user.id, timeframe);
            res.json({
                engagement,
                timeframe
            });
        }
        catch (error) {
            console.error('Get engagement analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch engagement analytics' });
        }
    });
    // GET /api/analytics/content - Content performance analytics
    router.get('/content', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const timeframe = parseTimeframe(req);
            const content = await analyticsService.getContentPerformance(req.user.id, timeframe);
            res.json({
                content,
                timeframe
            });
        }
        catch (error) {
            console.error('Get content analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch content analytics' });
        }
    });
    // GET /api/analytics/articles/:id - Article-specific analytics
    router.get('/articles/:id', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { id } = req.params;
            const timeframe = parseTimeframe(req);
            const analytics = await analyticsService.getArticleAnalytics(id, timeframe);
            res.json({
                analytics,
                timeframe
            });
        }
        catch (error) {
            console.error('Get article analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch article analytics' });
        }
    });
    // POST /api/analytics/track/pageview - Track page view
    router.post('/track/pageview', async (req, res) => {
        try {
            const { articleId, userId, metadata = {} } = req.body;
            if (!articleId) {
                return res.status(400).json({ error: 'Article ID is required' });
            }
            await analyticsService.trackPageView(articleId, userId, metadata);
            res.json({
                message: 'Page view tracked successfully'
            });
        }
        catch (error) {
            console.error('Track page view error:', error);
            res.status(500).json({ error: 'Failed to track page view' });
        }
    });
    // POST /api/analytics/track/social-share - Track social share
    router.post('/track/social-share', async (req, res) => {
        try {
            const { articleId, platform } = req.body;
            if (!articleId || !platform) {
                return res.status(400).json({ error: 'Article ID and platform are required' });
            }
            await analyticsService.trackSocialShare(articleId, platform);
            res.json({
                message: 'Social share tracked successfully'
            });
        }
        catch (error) {
            console.error('Track social share error:', error);
            res.status(500).json({ error: 'Failed to track social share' });
        }
    });
    // POST /api/analytics/track/newsletter-signup - Track newsletter signup
    router.post('/track/newsletter-signup', async (req, res) => {
        try {
            const { articleId, subscriberEmail } = req.body;
            if (!articleId || !subscriberEmail) {
                return res.status(400).json({ error: 'Article ID and subscriber email are required' });
            }
            await analyticsService.trackNewsletterSignup(articleId, subscriberEmail);
            res.json({
                message: 'Newsletter signup tracked successfully'
            });
        }
        catch (error) {
            console.error('Track newsletter signup error:', error);
            res.status(500).json({ error: 'Failed to track newsletter signup' });
        }
    });
    // POST /api/analytics/track/affiliate-click - Track affiliate click
    router.post('/track/affiliate-click', async (req, res) => {
        try {
            const { articleId, linkId } = req.body;
            if (!articleId || !linkId) {
                return res.status(400).json({ error: 'Article ID and link ID are required' });
            }
            await analyticsService.trackAffiliateClick(articleId, linkId);
            res.json({
                message: 'Affiliate click tracked successfully'
            });
        }
        catch (error) {
            console.error('Track affiliate click error:', error);
            res.status(500).json({ error: 'Failed to track affiliate click' });
        }
    });
    // POST /api/analytics/revenue/ad - Record ad revenue
    router.post('/revenue/ad', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { source, revenue, impressions, clicks } = req.body;
            if (!source || revenue === undefined) {
                return res.status(400).json({ error: 'Source and revenue are required' });
            }
            const validSources = ['adsense', 'media_net', 'direct'];
            if (!validSources.includes(source)) {
                return res.status(400).json({ error: 'Invalid ad source' });
            }
            if (typeof revenue !== 'number' || revenue < 0) {
                return res.status(400).json({ error: 'Revenue must be a positive number' });
            }
            await analyticsService.recordAdRevenue(req.user.id, source, revenue, impressions, clicks);
            res.json({
                message: 'Ad revenue recorded successfully'
            });
        }
        catch (error) {
            console.error('Record ad revenue error:', error);
            res.status(500).json({ error: 'Failed to record ad revenue' });
        }
    });
    // GET /api/analytics/compare - Compare metrics between periods
    router.get('/compare', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { metric, current_period, comparison_period } = req.query;
            if (!metric || !current_period || !comparison_period) {
                return res.status(400).json({
                    error: 'Metric, current_period, and comparison_period are required'
                });
            }
            const validMetrics = ['pageViews', 'revenue', 'subscribers'];
            if (!validMetrics.includes(metric)) {
                return res.status(400).json({ error: 'Invalid metric' });
            }
            const comparison = await analyticsService.compareMetrics(req.user.id, metric, current_period, comparison_period);
            res.json({
                comparison,
                metric,
                current_period,
                comparison_period
            });
        }
        catch (error) {
            console.error('Compare metrics error:', error);
            res.status(500).json({ error: 'Failed to compare metrics' });
        }
    });
    // GET /api/analytics/export - Export analytics data
    router.get('/export', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { format = 'json', days = 30 } = req.query;
            const timeframe = parseTimeframe(req);
            if (format !== 'json' && format !== 'csv') {
                return res.status(400).json({ error: 'Format must be json or csv' });
            }
            const report = await analyticsService.generateAnalyticsReport(req.user.id, timeframe);
            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=analytics-report.csv');
                // In a real implementation, you would convert the report to CSV format
                res.send('CSV export not yet implemented');
            }
            else {
                res.json({
                    report,
                    format,
                    exportedAt: new Date().toISOString()
                });
            }
        }
        catch (error) {
            console.error('Export analytics error:', error);
            res.status(500).json({ error: 'Failed to export analytics' });
        }
    });
    // GET /api/analytics/realtime - Real-time analytics
    router.get('/realtime', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            // In a real implementation, this would return real-time metrics
            // For now, we'll return recent data from the last hour
            const realtimeData = {
                activeVisitors: Math.floor(Math.random() * 50) + 10,
                pageViewsLastHour: Math.floor(Math.random() * 200) + 50,
                topPages: [
                    { path: '/articles/getting-started', views: 45 },
                    { path: '/articles/advanced-tips', views: 32 },
                    { path: '/articles/best-practices', views: 28 }
                ],
                trafficSources: {
                    direct: 35,
                    organic: 40,
                    social: 15,
                    referral: 10
                },
                timestamp: new Date().toISOString()
            };
            res.json({
                realtime: realtimeData
            });
        }
        catch (error) {
            console.error('Get realtime analytics error:', error);
            res.status(500).json({ error: 'Failed to fetch realtime analytics' });
        }
    });
    // GET /api/analytics/summary - Quick analytics summary
    router.get('/summary', authenticateToken, async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { days = 30 } = req.query;
            const timeframe = { period: `${days}d` };
            const [overview, revenue] = await Promise.all([
                analyticsService.getDashboardOverview(req.user.id, timeframe),
                analyticsService.getRevenueAnalytics(req.user.id, timeframe)
            ]);
            const summary = {
                totalPageViews: overview.totalPageViews,
                totalRevenue: overview.totalRevenue,
                totalSubscribers: overview.totalSubscribers,
                totalNewsletterSubscribers: overview.totalNewsletterSubscribers,
                revenueBreakdown: revenue.revenueBreakdown,
                topArticles: overview.topPerformingArticles.slice(0, 3),
                timeframe: `Last ${days} days`
            };
            res.json({
                summary
            });
        }
        catch (error) {
            console.error('Get analytics summary error:', error);
            res.status(500).json({ error: 'Failed to fetch analytics summary' });
        }
    });
    return router;
}
//# sourceMappingURL=analytics.js.map