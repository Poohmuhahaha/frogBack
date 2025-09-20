import { Request, Response } from 'express';
import Stripe from 'stripe';
import database from '../database/connection';
import { CustomError } from '../middleware/errorHandler';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20'
});

interface StripeWebhookRequest extends Request {
  body: Buffer;
  webhookSignature?: string;
}

export class StripeWebhookHandler {
  private endpointSecret: string;

  constructor() {
    this.endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    if (!this.endpointSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
    }
  }

  verifySignature(body: Buffer, signature: string): Stripe.Event {
    try {
      return stripe.webhooks.constructEvent(body, signature, this.endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      throw new CustomError('Invalid webhook signature', 400, 'WEBHOOK_SIGNATURE_INVALID');
    }
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    console.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.created':
        await this.handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case 'customer.updated':
        await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      case 'customer.deleted':
        await this.handleCustomerDeleted(event.data.object as Stripe.Customer);
        break;

      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      default:
        console.log(`Unhandled Stripe webhook event type: ${event.type}`);
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    console.log(`Subscription created: ${subscription.id}`);

    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0]?.price.id;

    await database.transaction(async (client) => {
      const userQuery = `
        SELECT id FROM users WHERE stripe_customer_id = $1
      `;
      const userResult = await client.query(userQuery, [customerId]);

      if (userResult.rows.length === 0) {
        throw new CustomError('User not found for Stripe customer', 404, 'USER_NOT_FOUND');
      }

      const userId = userResult.rows[0].id;

      const planQuery = `
        SELECT id, name FROM subscription_plans WHERE stripe_price_id = $1
      `;
      const planResult = await client.query(planQuery, [priceId]);

      if (planResult.rows.length === 0) {
        throw new CustomError('Subscription plan not found', 404, 'PLAN_NOT_FOUND');
      }

      const planId = planResult.rows[0].id;

      const insertSubscriptionQuery = `
        INSERT INTO subscriptions (
          id, user_id, plan_id, stripe_subscription_id, status,
          current_period_start, current_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = NOW()
      `;

      await client.query(insertSubscriptionQuery, [
        subscription.id,
        userId,
        planId,
        subscription.id,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000)
      ]);

      const updateUserQuery = `
        UPDATE users SET subscription_status = $1, updated_at = NOW() WHERE id = $2
      `;
      await client.query(updateUserQuery, [subscription.status, userId]);
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    console.log(`Subscription updated: ${subscription.id}`);

    const updateQuery = `
      UPDATE subscriptions SET
        status = $1,
        current_period_start = $2,
        current_period_end = $3,
        updated_at = NOW()
      WHERE stripe_subscription_id = $4
    `;

    await database.query(updateQuery, [
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      subscription.id
    ]);

    const userUpdateQuery = `
      UPDATE users SET subscription_status = $1, updated_at = NOW()
      FROM subscriptions
      WHERE users.id = subscriptions.user_id
      AND subscriptions.stripe_subscription_id = $2
    `;

    await database.query(userUpdateQuery, [subscription.status, subscription.id]);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    console.log(`Subscription deleted: ${subscription.id}`);

    await database.transaction(async (client) => {
      const updateSubscriptionQuery = `
        UPDATE subscriptions SET
          status = 'canceled',
          canceled_at = NOW(),
          updated_at = NOW()
        WHERE stripe_subscription_id = $1
      `;
      await client.query(updateSubscriptionQuery, [subscription.id]);

      const updateUserQuery = `
        UPDATE users SET subscription_status = 'canceled', updated_at = NOW()
        FROM subscriptions
        WHERE users.id = subscriptions.user_id
        AND subscriptions.stripe_subscription_id = $1
      `;
      await client.query(updateUserQuery, [subscription.id]);
    });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    console.log(`Payment succeeded for invoice: ${invoice.id}`);

    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    await database.transaction(async (client) => {
      const insertPaymentQuery = `
        INSERT INTO payments (
          id, stripe_payment_intent_id, stripe_invoice_id, amount, currency,
          status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (stripe_invoice_id) DO NOTHING
      `;

      await client.query(insertPaymentQuery, [
        invoice.payment_intent as string,
        invoice.payment_intent as string,
        invoice.id,
        invoice.amount_paid,
        invoice.currency,
        'succeeded'
      ]);

      const updateSubscriptionQuery = `
        UPDATE subscriptions SET
          status = 'active',
          updated_at = NOW()
        WHERE stripe_subscription_id = $1
      `;
      await client.query(updateSubscriptionQuery, [subscriptionId]);

      const updateUserQuery = `
        UPDATE users SET subscription_status = 'active', updated_at = NOW()
        FROM subscriptions
        WHERE users.id = subscriptions.user_id
        AND subscriptions.stripe_subscription_id = $1
      `;
      await client.query(updateUserQuery, [subscriptionId]);
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    console.log(`Payment failed for invoice: ${invoice.id}`);

    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    await database.transaction(async (client) => {
      const insertPaymentQuery = `
        INSERT INTO payments (
          id, stripe_payment_intent_id, stripe_invoice_id, amount, currency,
          status, failure_reason, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (stripe_invoice_id) DO UPDATE SET
          status = EXCLUDED.status,
          failure_reason = EXCLUDED.failure_reason,
          updated_at = NOW()
      `;

      await client.query(insertPaymentQuery, [
        invoice.payment_intent as string,
        invoice.payment_intent as string,
        invoice.id,
        invoice.amount_due,
        invoice.currency,
        'failed',
        'Payment method declined'
      ]);

      const updateSubscriptionQuery = `
        UPDATE subscriptions SET
          status = 'past_due',
          updated_at = NOW()
        WHERE stripe_subscription_id = $1
      `;
      await client.query(updateSubscriptionQuery, [subscriptionId]);

      const updateUserQuery = `
        UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
        FROM subscriptions
        WHERE users.id = subscriptions.user_id
        AND subscriptions.stripe_subscription_id = $1
      `;
      await client.query(updateUserQuery, [subscriptionId]);
    });
  }

  private async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    console.log(`Customer created: ${customer.id}`);

    const updateQuery = `
      UPDATE users SET
        stripe_customer_id = $1,
        updated_at = NOW()
      WHERE email = $2
    `;

    await database.query(updateQuery, [customer.id, customer.email]);
  }

  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    console.log(`Customer updated: ${customer.id}`);

    const updateQuery = `
      UPDATE users SET
        updated_at = NOW()
      WHERE stripe_customer_id = $1
    `;

    await database.query(updateQuery, [customer.id]);
  }

  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    console.log(`Customer deleted: ${customer.id}`);

    const updateQuery = `
      UPDATE users SET
        stripe_customer_id = NULL,
        subscription_status = 'canceled',
        updated_at = NOW()
      WHERE stripe_customer_id = $1
    `;

    await database.query(updateQuery, [customer.id]);
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log(`Payment intent succeeded: ${paymentIntent.id}`);

    const insertPaymentQuery = `
      INSERT INTO payments (
        id, stripe_payment_intent_id, amount, currency, status,
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
    `;

    await database.query(insertPaymentQuery, [
      paymentIntent.id,
      paymentIntent.id,
      paymentIntent.amount,
      paymentIntent.currency,
      'succeeded',
      JSON.stringify(paymentIntent.metadata)
    ]);
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log(`Payment intent failed: ${paymentIntent.id}`);

    const insertPaymentQuery = `
      INSERT INTO payments (
        id, stripe_payment_intent_id, amount, currency, status,
        failure_reason, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
        status = EXCLUDED.status,
        failure_reason = EXCLUDED.failure_reason,
        updated_at = NOW()
    `;

    await database.query(insertPaymentQuery, [
      paymentIntent.id,
      paymentIntent.id,
      paymentIntent.amount,
      paymentIntent.currency,
      'failed',
      paymentIntent.last_payment_error?.message || 'Payment failed',
      JSON.stringify(paymentIntent.metadata)
    ]);
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    console.log(`Checkout session completed: ${session.id}`);

    if (session.mode === 'subscription') {
      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      const updateUserQuery = `
        UPDATE users SET
          stripe_customer_id = $1,
          updated_at = NOW()
        WHERE email = $2
      `;

      await database.query(updateUserQuery, [customerId, session.customer_email]);
    }

    if (session.mode === 'payment') {
      const paymentIntentId = session.payment_intent as string;

      const insertPaymentQuery = `
        INSERT INTO payments (
          id, stripe_payment_intent_id, stripe_session_id, amount, currency,
          status, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (stripe_payment_intent_id) DO NOTHING
      `;

      await database.query(insertPaymentQuery, [
        paymentIntentId,
        paymentIntentId,
        session.id,
        session.amount_total,
        session.currency,
        'succeeded',
        JSON.stringify(session.metadata)
      ]);
    }
  }
}

export const stripeWebhookHandler = async (req: StripeWebhookRequest, res: Response): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({
        error: 'Missing signature',
        message: 'Stripe signature header is required'
      });
      return;
    }

    const webhookHandler = new StripeWebhookHandler();
    const event = webhookHandler.verifySignature(req.body, signature);

    await webhookHandler.handleEvent(event);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);

    if (error instanceof CustomError) {
      res.status(error.statusCode || 400).json({
        error: error.message,
        code: error.code
      });
    } else {
      res.status(400).json({
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};