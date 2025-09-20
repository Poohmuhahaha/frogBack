import Stripe from 'stripe';
import database from '../database/connection';
import { CustomError } from '../middleware/errorHandler';

interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  apiVersion: '2024-06-20';
}

interface CreateCustomerData {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

interface CreateSubscriptionData {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
  trialPeriodDays?: number;
}

interface CreatePaymentIntentData {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
  automaticPaymentMethods?: boolean;
}

interface CreateCheckoutSessionData {
  customerId?: string;
  customerEmail?: string;
  priceId?: string;
  lineItems?: Stripe.Checkout.SessionCreateParams.LineItem[];
  mode: 'payment' | 'subscription' | 'setup';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export class StripeIntegration {
  private stripe: Stripe;
  private config: StripeConfig;

  constructor() {
    this.config = {
      secretKey: process.env.STRIPE_SECRET_KEY!,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      apiVersion: '2024-06-20'
    };

    if (!this.config.secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(this.config.secretKey, {
      apiVersion: this.config.apiVersion
    });
  }

  async createCustomer(data: CreateCustomerData): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        metadata: data.metadata || {}
      });

      await this.saveCustomerToDatabase(customer);
      return customer;
    } catch (error) {
      console.error('Stripe create customer error:', error);
      throw new CustomError('Failed to create Stripe customer', 400, 'STRIPE_CUSTOMER_CREATE_FAILED');
    }
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
      return customer;
    } catch (error) {
      console.error('Stripe get customer error:', error);
      throw new CustomError('Failed to retrieve Stripe customer', 404, 'STRIPE_CUSTOMER_NOT_FOUND');
    }
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerData>): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        email: data.email,
        name: data.name,
        metadata: data.metadata
      });

      return customer;
    } catch (error) {
      console.error('Stripe update customer error:', error);
      throw new CustomError('Failed to update Stripe customer', 400, 'STRIPE_CUSTOMER_UPDATE_FAILED');
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerId);

      await database.query(
        'UPDATE users SET stripe_customer_id = NULL WHERE stripe_customer_id = $1',
        [customerId]
      );
    } catch (error) {
      console.error('Stripe delete customer error:', error);
      throw new CustomError('Failed to delete Stripe customer', 400, 'STRIPE_CUSTOMER_DELETE_FAILED');
    }
  }

  async createSubscription(data: CreateSubscriptionData): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: data.customerId,
        items: [{ price: data.priceId }],
        metadata: data.metadata || {},
        trial_period_days: data.trialPeriodDays,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      });

      await this.saveSubscriptionToDatabase(subscription);
      return subscription;
    } catch (error) {
      console.error('Stripe create subscription error:', error);
      throw new CustomError('Failed to create subscription', 400, 'STRIPE_SUBSCRIPTION_CREATE_FAILED');
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Stripe get subscription error:', error);
      throw new CustomError('Failed to retrieve subscription', 404, 'STRIPE_SUBSCRIPTION_NOT_FOUND');
    }
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Stripe.SubscriptionUpdateParams>): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, updates);
      return subscription;
    } catch (error) {
      console.error('Stripe update subscription error:', error);
      throw new CustomError('Failed to update subscription', 400, 'STRIPE_SUBSCRIPTION_UPDATE_FAILED');
    }
  }

  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<Stripe.Subscription> {
    try {
      let subscription: Stripe.Subscription;

      if (immediately) {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }

      await this.updateSubscriptionInDatabase(subscription);
      return subscription;
    } catch (error) {
      console.error('Stripe cancel subscription error:', error);
      throw new CustomError('Failed to cancel subscription', 400, 'STRIPE_SUBSCRIPTION_CANCEL_FAILED');
    }
  }

  async createPaymentIntent(data: CreatePaymentIntentData): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: data.amount,
        currency: data.currency,
        customer: data.customerId,
        metadata: data.metadata || {},
        automatic_payment_methods: {
          enabled: data.automaticPaymentMethods !== false
        }
      });

      return paymentIntent;
    } catch (error) {
      console.error('Stripe create payment intent error:', error);
      throw new CustomError('Failed to create payment intent', 400, 'STRIPE_PAYMENT_INTENT_CREATE_FAILED');
    }
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethodId?: string): Promise<Stripe.PaymentIntent> {
    try {
      const confirmParams: Stripe.PaymentIntentConfirmParams = {};
      if (paymentMethodId) {
        confirmParams.payment_method = paymentMethodId;
      }

      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, confirmParams);
      return paymentIntent;
    } catch (error) {
      console.error('Stripe confirm payment intent error:', error);
      throw new CustomError('Failed to confirm payment intent', 400, 'STRIPE_PAYMENT_INTENT_CONFIRM_FAILED');
    }
  }

  async createCheckoutSession(data: CreateCheckoutSessionData): Promise<Stripe.Checkout.Session> {
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: data.mode,
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: data.metadata || {}
      };

      if (data.customerId) {
        sessionParams.customer = data.customerId;
      } else if (data.customerEmail) {
        sessionParams.customer_email = data.customerEmail;
      }

      if (data.lineItems) {
        sessionParams.line_items = data.lineItems;
      } else if (data.priceId) {
        sessionParams.line_items = [{ price: data.priceId, quantity: 1 }];
      }

      if (data.mode === 'subscription') {
        sessionParams.payment_method_collection = 'if_required';
      }

      const session = await this.stripe.checkout.sessions.create(sessionParams);
      return session;
    } catch (error) {
      console.error('Stripe create checkout session error:', error);
      throw new CustomError('Failed to create checkout session', 400, 'STRIPE_CHECKOUT_SESSION_CREATE_FAILED');
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'subscription']
      });
      return session;
    } catch (error) {
      console.error('Stripe retrieve checkout session error:', error);
      throw new CustomError('Failed to retrieve checkout session', 404, 'STRIPE_CHECKOUT_SESSION_NOT_FOUND');
    }
  }

  async getCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      return paymentMethods.data;
    } catch (error) {
      console.error('Stripe get payment methods error:', error);
      throw new CustomError('Failed to retrieve payment methods', 400, 'STRIPE_PAYMENT_METHODS_RETRIEVE_FAILED');
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(paymentMethodId);
      return paymentMethod;
    } catch (error) {
      console.error('Stripe detach payment method error:', error);
      throw new CustomError('Failed to detach payment method', 400, 'STRIPE_PAYMENT_METHOD_DETACH_FAILED');
    }
  }

  async createPrice(data: {
    productId: string;
    unitAmount: number;
    currency: string;
    recurring?: { interval: 'month' | 'year' };
    metadata?: Record<string, string>;
  }): Promise<Stripe.Price> {
    try {
      const price = await this.stripe.prices.create({
        product: data.productId,
        unit_amount: data.unitAmount,
        currency: data.currency,
        recurring: data.recurring,
        metadata: data.metadata || {}
      });

      return price;
    } catch (error) {
      console.error('Stripe create price error:', error);
      throw new CustomError('Failed to create price', 400, 'STRIPE_PRICE_CREATE_FAILED');
    }
  }

  async listPrices(productId?: string): Promise<Stripe.Price[]> {
    try {
      const prices = await this.stripe.prices.list({
        product: productId,
        active: true
      });
      return prices.data;
    } catch (error) {
      console.error('Stripe list prices error:', error);
      throw new CustomError('Failed to list prices', 400, 'STRIPE_PRICES_LIST_FAILED');
    }
  }

  async getInvoices(customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit
      });
      return invoices.data;
    } catch (error) {
      console.error('Stripe get invoices error:', error);
      throw new CustomError('Failed to retrieve invoices', 400, 'STRIPE_INVOICES_RETRIEVE_FAILED');
    }
  }

  async createInvoiceItem(data: {
    customerId: string;
    amount: number;
    currency: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.InvoiceItem> {
    try {
      const invoiceItem = await this.stripe.invoiceItems.create({
        customer: data.customerId,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        metadata: data.metadata || {}
      });

      return invoiceItem;
    } catch (error) {
      console.error('Stripe create invoice item error:', error);
      throw new CustomError('Failed to create invoice item', 400, 'STRIPE_INVOICE_ITEM_CREATE_FAILED');
    }
  }

  private async saveCustomerToDatabase(customer: Stripe.Customer): Promise<void> {
    const query = `
      UPDATE users SET
        stripe_customer_id = $1,
        updated_at = NOW()
      WHERE email = $2
    `;

    await database.query(query, [customer.id, customer.email]);
  }

  private async saveSubscriptionToDatabase(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;

    const userQuery = `
      SELECT id FROM users WHERE stripe_customer_id = $1
    `;
    const userResult = await database.query(userQuery, [customerId]);

    if (userResult.rows.length === 0) {
      throw new CustomError('User not found for subscription', 404, 'USER_NOT_FOUND');
    }

    const userId = userResult.rows[0].id;
    const priceId = subscription.items.data[0]?.price.id;

    const planQuery = `
      SELECT id FROM subscription_plans WHERE stripe_price_id = $1
    `;
    const planResult = await database.query(planQuery, [priceId]);

    if (planResult.rows.length === 0) {
      throw new CustomError('Subscription plan not found', 404, 'PLAN_NOT_FOUND');
    }

    const planId = planResult.rows[0].id;

    const insertQuery = `
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

    await database.query(insertQuery, [
      subscription.id,
      userId,
      planId,
      subscription.id,
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000)
    ]);
  }

  private async updateSubscriptionInDatabase(subscription: Stripe.Subscription): Promise<void> {
    const updateQuery = `
      UPDATE subscriptions SET
        status = $1,
        current_period_start = $2,
        current_period_end = $3,
        canceled_at = $4,
        cancel_at_period_end = $5,
        updated_at = NOW()
      WHERE stripe_subscription_id = $6
    `;

    await database.query(updateQuery, [
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      subscription.cancel_at_period_end,
      subscription.id
    ]);

    const updateUserQuery = `
      UPDATE users SET subscription_status = $1, updated_at = NOW()
      FROM subscriptions
      WHERE users.id = subscriptions.user_id
      AND subscriptions.stripe_subscription_id = $2
    `;

    await database.query(updateUserQuery, [subscription.status, subscription.id]);
  }

  getPublishableKey(): string {
    return this.config.publishableKey;
  }
}

const stripeIntegration = new StripeIntegration();
export default stripeIntegration;