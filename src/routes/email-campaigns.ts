import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EmailService } from '../services/EmailService';

export interface AuthRequest extends Request {
  user?: any;
}

export function createEmailCampaignsRouter(pool: Pool): Router {
  const router = Router();
  const emailService = new EmailService(pool);

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

  // GET /api/email-campaigns - Get email campaigns
  router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const campaigns = await emailService.getCampaigns(req.user.id);

      res.json({
        campaigns
      });
    } catch (error) {
      console.error('Get email campaigns error:', error);
      res.status(500).json({ error: 'Failed to fetch email campaigns' });
    }
  });

  // GET /api/email-campaigns/:id - Get specific email campaign
  router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const campaign = await emailService.getCampaign(id, req.user.id);

      if (!campaign) {
        return res.status(404).json({ error: 'Email campaign not found' });
      }

      res.json({
        campaign
      });
    } catch (error) {
      console.error('Get email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch email campaign';

      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/email-campaigns - Create email campaign
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        name,
        subject,
        content,
        type = 'newsletter',
        scheduled_at
      } = req.body;

      // Validate required fields
      if (!name || !subject || !content) {
        return res.status(400).json({
          error: 'Name, subject, and content are required'
        });
      }

      const campaignData = {
        creator_id: req.user.id,
        name: name.trim(),
        subject: subject.trim(),
        content,
        type,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined
      };

      const campaign = await emailService.createCampaign(campaignData);

      res.status(201).json({
        message: 'Email campaign created successfully',
        campaign
      });
    } catch (error) {
      console.error('Create email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create email campaign';
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/email-campaigns/:id - Update email campaign
  router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const {
        name,
        subject,
        content,
        type,
        scheduled_at
      } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (subject !== undefined) updateData.subject = subject.trim();
      if (content !== undefined) updateData.content = content;
      if (type !== undefined) updateData.type = type;
      if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at ? new Date(scheduled_at) : null;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const campaign = await emailService.updateCampaign(id, updateData, req.user.id);

      res.json({
        message: 'Email campaign updated successfully',
        campaign
      });
    } catch (error) {
      console.error('Update email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update email campaign';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('Cannot edit')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/email-campaigns/:id/send - Send email campaign
  router.post('/:id/send', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const {
        segment_filters = {},
        exclude_unsubscribed = true,
        send_at
      } = req.body;

      const sendRequest = {
        campaign_id: id,
        segment_filters,
        exclude_unsubscribed: Boolean(exclude_unsubscribed),
        send_at: send_at ? new Date(send_at) : undefined
      };

      const result = await emailService.sendBulkEmail(sendRequest);

      res.json({
        message: 'Email campaign sent successfully',
        sent: result.sent,
        failed: result.failed,
        errors: result.errors
      });
    } catch (error) {
      console.error('Send email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to send email campaign';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('cannot be sent')) {
        return res.status(400).json({ error: message });
      }
      if (message.includes('No subscribers found')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/email-campaigns/:id/schedule - Schedule email campaign
  router.post('/:id/schedule', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { scheduled_at } = req.body;

      if (!scheduled_at) {
        return res.status(400).json({ error: 'Scheduled time is required' });
      }

      const scheduledAt = new Date(scheduled_at);

      const campaign = await emailService.scheduleCampaign(id, scheduledAt, req.user.id);

      res.json({
        message: 'Email campaign scheduled successfully',
        campaign
      });
    } catch (error) {
      console.error('Schedule email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to schedule email campaign';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('cannot be scheduled')) {
        return res.status(400).json({ error: message });
      }
      if (message.includes('must be in the future')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/email-campaigns/:id/duplicate - Duplicate email campaign
  router.post('/:id/duplicate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { new_name } = req.body;

      if (!new_name) {
        return res.status(400).json({ error: 'New campaign name is required' });
      }

      const duplicatedCampaign = await emailService.duplicateCampaign(
        id,
        new_name.trim(),
        req.user.id
      );

      if (!duplicatedCampaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      res.status(201).json({
        message: 'Email campaign duplicated successfully',
        campaign: duplicatedCampaign
      });
    } catch (error) {
      console.error('Duplicate email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to duplicate email campaign';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/email-campaigns/:id - Delete email campaign
  router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      await emailService.deleteCampaign(id, req.user.id);

      res.json({
        message: 'Email campaign deleted successfully'
      });
    } catch (error) {
      console.error('Delete email campaign error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete email campaign';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('Can only delete draft')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/email-campaigns/:id/analytics - Get campaign analytics
  router.get('/:id/analytics', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const analytics = await emailService.getCampaignAnalytics(id, req.user.id);

      res.json({
        analytics
      });
    } catch (error) {
      console.error('Get campaign analytics error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch campaign analytics';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/email-campaigns/stats/overview - Get email campaign statistics
  router.get('/stats/overview', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const stats = await emailService.getCampaignStats(req.user.id);

      res.json({
        stats
      });
    } catch (error) {
      console.error('Get campaign stats error:', error);
      res.status(500).json({ error: 'Failed to fetch campaign statistics' });
    }
  });

  // POST /api/email-campaigns/subscribers - Add subscriber
  router.post('/subscribers', async (req: Request, res: Response) => {
    try {
      const {
        email,
        name,
        source = 'website',
        tags = []
      } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const subscriberData = {
        email: email.toLowerCase().trim(),
        name: name?.trim(),
        source,
        tags: Array.isArray(tags) ? tags : []
      };

      const subscriber = await emailService.addSubscriber(subscriberData);

      res.status(201).json({
        message: 'Subscriber added successfully',
        subscriber
      });
    } catch (error) {
      console.error('Add subscriber error:', error);
      const message = error instanceof Error ? error.message : 'Failed to add subscriber';

      if (message.includes('already subscribed')) {
        return res.status(409).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/email-campaigns/subscribers/unsubscribe - Unsubscribe by email
  router.post('/subscribers/unsubscribe', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const subscriber = await emailService.unsubscribeByEmail(email.toLowerCase().trim());

      if (!subscriber) {
        return res.status(404).json({ error: 'Subscriber not found' });
      }

      res.json({
        message: 'Unsubscribed successfully',
        subscriber
      });
    } catch (error) {
      console.error('Unsubscribe error:', error);
      const message = error instanceof Error ? error.message : 'Failed to unsubscribe';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/email-campaigns/subscribers - Get subscribers
  router.get('/subscribers', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        status,
        source,
        tags,
        email_verified,
        engagement_score_min,
        engagement_score_max,
        search,
        limit = 50,
        offset = 0
      } = req.query;

      const filters: any = {
        limit: Math.min(parseInt(limit as string) || 50, 200),
        offset: parseInt(offset as string) || 0
      };

      if (status) filters.status = status as string;
      if (source) filters.source = source as string;
      if (email_verified !== undefined) filters.email_verified = email_verified === 'true';
      if (engagement_score_min) filters.engagement_score_min = parseInt(engagement_score_min as string);
      if (engagement_score_max) filters.engagement_score_max = parseInt(engagement_score_max as string);
      if (search) filters.search = search as string;
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        filters.tags = tagArray as string[];
      }

      const result = await emailService.getSubscribers(filters);

      res.json({
        subscribers: result.subscribers,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      console.error('Get subscribers error:', error);
      res.status(500).json({ error: 'Failed to fetch subscribers' });
    }
  });

  // GET /api/email-campaigns/subscribers/stats - Get subscriber statistics
  router.get('/subscribers/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const stats = await emailService.getSubscriberStats();

      res.json({
        stats
      });
    } catch (error) {
      console.error('Get subscriber stats error:', error);
      res.status(500).json({ error: 'Failed to fetch subscriber statistics' });
    }
  });

  // POST /api/email-campaigns/webhooks/sendgrid - Handle SendGrid webhooks
  router.post('/webhooks/sendgrid', async (req: Request, res: Response) => {
    try {
      const events = req.body;

      if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'Expected array of events' });
      }

      await emailService.handleSendGridWebhook(events);

      res.json({ received: true, processed: events.length });
    } catch (error) {
      console.error('SendGrid webhook error:', error);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  });

  // POST /api/email-campaigns/send-single - Send single email
  router.post('/send-single', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        to,
        subject,
        html_content,
        text_content,
        template_id,
        dynamic_template_data,
        custom_args,
        send_at
      } = req.body;

      if (!to || !subject || !html_content) {
        return res.status(400).json({
          error: 'To, subject, and HTML content are required'
        });
      }

      const emailRequest = {
        to,
        subject,
        html_content,
        text_content,
        template_id,
        dynamic_template_data,
        custom_args,
        send_at: send_at ? parseInt(send_at) : undefined
      };

      const result = await emailService.sendSingleEmail(emailRequest);

      if (result.status === 'failed') {
        return res.status(500).json({
          error: result.error || 'Failed to send email'
        });
      }

      res.json({
        message: 'Email sent successfully',
        message_id: result.message_id,
        status: result.status
      });
    } catch (error) {
      console.error('Send single email error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });

  // POST /api/email-campaigns/notify-article - Send article notification
  router.post('/notify-article', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { article_id, article_title, article_url } = req.body;

      if (!article_id || !article_title || !article_url) {
        return res.status(400).json({
          error: 'Article ID, title, and URL are required'
        });
      }

      await emailService.sendArticleNotification(article_id, article_title, article_url);

      res.json({
        message: 'Article notification sent to subscribers'
      });
    } catch (error) {
      console.error('Send article notification error:', error);
      res.status(500).json({ error: 'Failed to send article notification' });
    }
  });

  return router;
}