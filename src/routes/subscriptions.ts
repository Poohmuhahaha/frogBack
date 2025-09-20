import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { SubscriptionService } from '../services/SubscriptionService';

export interface AuthRequest extends Request {
  user?: any;
}

export function createSubscriptionsRouter(pool: Pool): Router {
  const router = Router();
  const subscriptionService = new SubscriptionService(pool);

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

  // GET /api/subscriptions/plans - Get all subscription plans
  router.get('/plans', async (req: Request, res: Response) => {
    try {
      const { creator_id } = req.query;

      const plans = await subscriptionService.getPlans(creator_id as string);

      res.json({
        plans
      });
    } catch (error) {
      console.error('Get subscription plans error:', error);
      res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
  });

  // GET /api/subscriptions/plans/:id - Get specific subscription plan
  router.get('/plans/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const plan = await subscriptionService.getPlan(id);

      if (!plan) {
        return res.status(404).json({ error: 'Subscription plan not found' });
      }

      res.json({
        plan
      });
    } catch (error) {
      console.error('Get subscription plan error:', error);
      res.status(500).json({ error: 'Failed to fetch subscription plan' });
    }
  });

  // POST /api/subscriptions/plans - Create subscription plan
  router.post('/plans', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        name,
        description,
        price,
        currency = 'USD',
        features = []
      } = req.body;

      // Validate required fields
      if (!name || !description || !price) {
        return res.status(400).json({
          error: 'Name, description, and price are required'
        });
      }

      // Validate price (must be positive integer in cents)
      if (typeof price !== 'number' || price <= 0 || !Number.isInteger(price)) {
        return res.status(400).json({
          error: 'Price must be a positive integer in cents'
        });
      }

      const planData = {
        creator_id: req.user.id,
        name: name.trim(),
        description: description.trim(),
        price,
        currency: currency.toUpperCase(),
        features: Array.isArray(features) ? features : []
      };

      const plan = await subscriptionService.createPlan(planData);

      res.status(201).json({
        message: 'Subscription plan created successfully',
        plan
      });
    } catch (error) {
      console.error('Create subscription plan error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create subscription plan';
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/subscriptions/plans/:id - Update subscription plan
  router.put('/plans/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { name, description, features, is_active } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description.trim();
      if (features !== undefined) updateData.features = Array.isArray(features) ? features : [];
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const plan = await subscriptionService.updatePlan(id, updateData, req.user.id);

      res.json({
        message: 'Subscription plan updated successfully',
        plan
      });
    } catch (error) {
      console.error('Update subscription plan error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update subscription plan';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/subscriptions/plans/:id - Deactivate subscription plan
  router.delete('/plans/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      await subscriptionService.deactivatePlan(id, req.user.id);

      res.json({
        message: 'Subscription plan deactivated successfully'
      });
    } catch (error) {
      console.error('Deactivate subscription plan error:', error);
      const message = error instanceof Error ? error.message : 'Failed to deactivate subscription plan';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/subscriptions/subscribe - Create subscription checkout session
  router.post('/subscribe', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const {
        planId,
        paymentMethodId,
        trialDays,
        couponCode
      } = req.body;

      if (!planId) {
        return res.status(400).json({ error: 'Plan ID is required' });
      }

      const subscriptionRequest = {
        userId: req.user.id,
        planId,
        paymentMethodId,
        trialDays: trialDays ? parseInt(trialDays) : undefined,
        couponCode: couponCode?.trim()
      };

      const checkoutSession = await subscriptionService.createSubscription(subscriptionRequest);

      res.json({
        message: 'Checkout session created successfully',
        checkout: checkoutSession
      });
    } catch (error) {
      console.error('Create subscription error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create subscription';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('already has an active subscription')) {
        return res.status(409).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/subscriptions/my - Get user's subscriptions
  router.get('/my', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const subscriptions = await subscriptionService.getUserSubscriptions(req.user.id);

      res.json({
        subscriptions
      });
    } catch (error) {
      console.error('Get user subscriptions error:', error);
      res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  });

  // GET /api/subscriptions/my/active - Get user's active subscriptions
  router.get('/my/active', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const subscriptions = await subscriptionService.getActiveUserSubscriptions(req.user.id);

      res.json({
        subscriptions
      });
    } catch (error) {
      console.error('Get active subscriptions error:', error);
      res.status(500).json({ error: 'Failed to fetch active subscriptions' });
    }
  });

  // GET /api/subscriptions/:id - Get specific subscription
  router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const subscription = await subscriptionService.getSubscription(id, req.user.id);

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      res.json({
        subscription
      });
    } catch (error) {
      console.error('Get subscription error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch subscription';

      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/subscriptions/:id/cancel - Cancel subscription
  router.post('/:id/cancel', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const subscription = await subscriptionService.cancelSubscription(id, req.user.id);

      res.json({
        message: 'Subscription canceled successfully',
        subscription
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel subscription';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('already canceled')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // POST /api/subscriptions/:id/reactivate - Reactivate canceled subscription
  router.post('/:id/reactivate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      const subscription = await subscriptionService.reactivateSubscription(id, req.user.id);

      res.json({
        message: 'Subscription reactivated successfully',
        subscription
      });
    } catch (error) {
      console.error('Reactivate subscription error:', error);
      const message = error instanceof Error ? error.message : 'Failed to reactivate subscription';

      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('Unauthorized')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('Only canceled subscriptions')) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  // GET /api/subscriptions/billing/portal - Create billing portal session
  router.get('/billing/portal', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { return_url } = req.query;

      const billingSession = await subscriptionService.createBillingPortalSession(
        req.user.id,
        return_url as string
      );

      res.json({
        billing_portal: billingSession
      });
    } catch (error) {
      console.error('Create billing portal error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create billing portal session';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/subscriptions/stats/overview - Get subscription statistics
  router.get('/stats/overview', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Only allow creators to view stats for their own content
      if (req.user.role !== 'creator') {
        return res.status(403).json({ error: 'Only creators can view subscription statistics' });
      }

      const stats = await subscriptionService.getSubscriptionStats(req.user.id);

      res.json({
        stats
      });
    } catch (error) {
      console.error('Get subscription stats error:', error);
      res.status(500).json({ error: 'Failed to fetch subscription statistics' });
    }
  });

  // POST /api/subscriptions/webhooks/stripe - Handle Stripe webhooks
  router.post('/webhooks/stripe', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const payload = req.body;

      // In a real implementation, you would verify the webhook signature
      // For now, we'll process the event directly
      const event = {
        id: payload.id || 'evt_test',
        type: payload.type,
        data: payload.data,
        created: payload.created || Math.floor(Date.now() / 1000)
      };

      await subscriptionService.handleStripeWebhook(event);

      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  });

  // GET /api/subscriptions/access/:planId - Check user access to plan
  router.get('/access/:planId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { planId } = req.params;

      const hasAccess = await subscriptionService.hasAccess(req.user.id, planId);

      res.json({
        hasAccess,
        userId: req.user.id,
        planId
      });
    } catch (error) {
      console.error('Check access error:', error);
      res.status(500).json({ error: 'Failed to check access' });
    }
  });

  // GET /api/subscriptions/access-level - Get user's access level
  router.get('/access-level', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const accessLevel = await subscriptionService.getUserAccessLevel(req.user.id);

      res.json({
        accessLevel,
        userId: req.user.id
      });
    } catch (error) {
      console.error('Get access level error:', error);
      res.status(500).json({ error: 'Failed to get access level' });
    }
  });

  return router;
}