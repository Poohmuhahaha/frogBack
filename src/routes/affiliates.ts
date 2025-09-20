import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { AffiliateService } from '../services/AffiliateService';

export interface AuthRequest extends Request {
  user?: any;
}

export function createAffiliatesRouter(pool: Pool): Router {
  const router = Router();
  const affiliateService = new AffiliateService(pool);

  // Middleware to authenticate JWT tokens
  const authenticateToken = async (req: AuthRequest, res: Response, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access token required' });
      }

      const token = authHeader.substring(7);
      // In a real implementation, this would verify the JWT token
      req.user = { id: 'user-id', role: 'creator' };
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // GET /api/affiliates/links - Get affiliate links with filtering
  router.get('/links', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        network,
        category,
        is_active,
        search,
        limit = 20,
        offset = 0
      } = req.query;

      const filters: any = {
        limit: Math.min(parseInt(limit as string) || 20, 100),
        offset: parseInt(offset as string) || 0
      };

      if (network) filters.network = network as string;
      if (category) filters.category = category as string;
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (search) filters.search = search as string;

      const result = await affiliateService.getLinks(req.user.id, filters);

      res.json({
        links: result.links,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      console.error('Get affiliate links error:', error);
      res.status(500).json({ error: 'Failed to fetch affiliate links' });
    }
  });

  // GET /api/affiliates/links/:id - Get specific affiliate link
  router.get('/links/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const link = await affiliateService.getLink(id, req.user.id);

      if (!link) {
        return res.status(404).json({ error: 'Affiliate link not found' });
      }

      res.json({
        link
      });
    } catch (error) {
      console.error('Get affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch affiliate link';

      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/affiliates/links - Create new affiliate link
  router.post('/links', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        name,
        originalUrl,
        network,
        commissionRate,
        category
      } = req.body;

      // Validate required fields
      if (!name || !originalUrl || !network) {
        return res.status(400).json({
          error: 'Name, original URL, and network are required'
        });
      }

      const linkData = {
        name: name.trim(),
        originalUrl: originalUrl.trim(),
        network,
        commissionRate: commissionRate ? parseFloat(commissionRate) : undefined,
        category: category?.trim()
      };

      const link = await affiliateService.createLink(req.user.id, linkData);

      res.status(201).json({
        message: 'Affiliate link created successfully',
        link
      });
    } catch (error) {
      console.error('Create affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create affiliate link';
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/affiliates/links/:id - Update affiliate link
  router.put('/links/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const {
        name,
        original_url,
        commission_rate,
        category,
        is_active
      } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (original_url !== undefined) updateData.original_url = original_url.trim();
      if (commission_rate !== undefined) updateData.commission_rate = parseFloat(commission_rate);
      if (category !== undefined) updateData.category = category?.trim();
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const link = await affiliateService.updateLink(id, updateData, req.user.id);

      res.json({
        message: 'Affiliate link updated successfully',
        link
      });
    } catch (error) {
      console.error('Update affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update affiliate link';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/affiliates/links/:id/activate - Activate affiliate link
  router.post('/links/:id/activate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const link = await affiliateService.activateLink(id, req.user.id);

      res.json({
        message: 'Affiliate link activated successfully',
        link
      });
    } catch (error) {
      console.error('Activate affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to activate affiliate link';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/affiliates/links/:id/deactivate - Deactivate affiliate link
  router.post('/links/:id/deactivate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const link = await affiliateService.deactivateLink(id, req.user.id);

      res.json({
        message: 'Affiliate link deactivated successfully',
        link
      });
    } catch (error) {
      console.error('Deactivate affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to deactivate affiliate link';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/affiliates/links/:id - Delete affiliate link
  router.delete('/links/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      await affiliateService.deleteLink(id, req.user.id);

      res.json({
        message: 'Affiliate link deleted successfully'
      });
    } catch (error) {
      console.error('Delete affiliate link error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete affiliate link';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/affiliates/links/:id/regenerate-code - Regenerate tracking code
  router.post('/links/:id/regenerate-code', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const link = await affiliateService.regenerateTrackingCode(id, req.user.id);

      res.json({
        message: 'Tracking code regenerated successfully',
        link
      });
    } catch (error) {
      console.error('Regenerate tracking code error:', error);
      const message = error instanceof Error ? error.message : 'Failed to regenerate tracking code';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/affiliates/track/:trackingCode - Track affiliate click (public endpoint)
  router.get('/track/:trackingCode', async (req: Request, res: Response) => {
    try {
      const { trackingCode } = req.params;
      const { articleId, redirectUrl } = req.query;

      // Get client information
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const referrer = req.headers.referer;

      const trackRequest = {
        trackingCode,
        articleId: articleId as string,
        ipAddress,
        userAgent,
        referrer,
        redirectUrl: redirectUrl as string
      };

      const result = await affiliateService.trackClick(trackRequest);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Redirect to the original URL
      if (result.redirectUrl) {
        res.redirect(result.redirectUrl);
      } else {
        res.status(404).json({ error: 'Redirect URL not found' });
      }
    } catch (error) {
      console.error('Track affiliate click error:', error);
      res.status(500).json({ error: 'Failed to track click' });
    }
  });

  // POST /api/affiliates/conversions - Record conversion
  router.post('/conversions', async (req: Request, res: Response) => {
    try {
      const {
        trackingCode,
        orderId,
        commissionAmount,
        conversionDate,
        metadata
      } = req.body;

      if (!trackingCode || commissionAmount === undefined) {
        return res.status(400).json({
          error: 'Tracking code and commission amount are required'
        });
      }

      if (typeof commissionAmount !== 'number' || commissionAmount < 0) {
        return res.status(400).json({
          error: 'Commission amount must be a positive number'
        });
      }

      const conversionData = {
        trackingCode,
        orderId,
        commissionAmount,
        conversionDate: conversionDate ? new Date(conversionDate) : undefined,
        metadata
      };

      await affiliateService.recordConversion(conversionData);

      res.json({
        message: 'Conversion recorded successfully'
      });
    } catch (error) {
      console.error('Record conversion error:', error);
      const message = error instanceof Error ? error.message : 'Failed to record conversion';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/affiliates/analytics/:id - Get link analytics
  router.get('/analytics/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { days = 30 } = req.query;

      const analytics = await affiliateService.getLinkAnalytics(
        id,
        req.user.id,
        parseInt(days as string) || 30
      );

      res.json({
        analytics
      });
    } catch (error) {
      console.error('Get link analytics error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch link analytics';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/affiliates/summary - Get creator affiliate summary
  router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { days = 30 } = req.query;

      const summary = await affiliateService.getCreatorSummary(
        req.user.id,
        parseInt(days as string) || 30
      );

      res.json({
        summary
      });
    } catch (error) {
      console.error('Get affiliate summary error:', error);
      res.status(500).json({ error: 'Failed to fetch affiliate summary' });
    }
  });

  // GET /api/affiliates/analytics/network-performance - Get network performance
  router.get('/analytics/network-performance', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { days = 30 } = req.query;

      const networkPerformance = await affiliateService.getNetworkPerformance(
        req.user.id,
        parseInt(days as string) || 30
      );

      res.json({
        networkPerformance
      });
    } catch (error) {
      console.error('Get network performance error:', error);
      res.status(500).json({ error: 'Failed to fetch network performance' });
    }
  });

  // GET /api/affiliates/analytics/monthly-commission - Get monthly commission breakdown
  router.get('/analytics/monthly-commission', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { months = 12 } = req.query;

      const monthlyCommission = await affiliateService.getMonthlyCommissionBreakdown(
        req.user.id,
        parseInt(months as string) || 12
      );

      res.json({
        monthlyCommission
      });
    } catch (error) {
      console.error('Get monthly commission error:', error);
      res.status(500).json({ error: 'Failed to fetch monthly commission data' });
    }
  });

  // GET /api/affiliates/suggestions/:id - Get optimization suggestions
  router.get('/suggestions/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const suggestions = await affiliateService.getOptimizationSuggestions(id, req.user.id);

      res.json({
        suggestions
      });
    } catch (error) {
      console.error('Get optimization suggestions error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch optimization suggestions';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/affiliates/links/:id/clicks - Get click history
  router.get('/links/:id/clicks', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { limit = 50 } = req.query;

      const clickHistory = await affiliateService.getClickHistory(
        id,
        req.user.id,
        parseInt(limit as string) || 50
      );

      res.json({
        clicks: clickHistory
      });
    } catch (error) {
      console.error('Get click history error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch click history';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/affiliates/export - Export affiliate data
  router.get('/export', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { format = 'json', days = 30 } = req.query;

      if (format !== 'json' && format !== 'csv') {
        return res.status(400).json({ error: 'Format must be json or csv' });
      }

      const exportData = await affiliateService.exportAnalytics(
        req.user.id,
        format as any,
        parseInt(days as string) || 30
      );

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=affiliate-analytics.csv');
        res.send(exportData);
      } else {
        res.json({
          data: exportData
        });
      }
    } catch (error) {
      console.error('Export affiliate data error:', error);
      res.status(500).json({ error: 'Failed to export affiliate data' });
    }
  });

  // GET /api/affiliates/url/:id - Get tracked URL for link
  router.get('/url/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { baseUrl } = req.query;

      const trackedUrl = await affiliateService.buildTrackedUrl(id, baseUrl as string);

      if (!trackedUrl) {
        return res.status(404).json({ error: 'Affiliate link not found' });
      }

      res.json({
        trackedUrl
      });
    } catch (error) {
      console.error('Get tracked URL error:', error);
      res.status(500).json({ error: 'Failed to get tracked URL' });
    }
  });

  return router;
}