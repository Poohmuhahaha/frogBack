import { Request, Response } from 'express';
import crypto from 'crypto';
import database from '../database/connection';
import { CustomError } from '../middleware/errorHandler';

interface SendGridWebhookRequest extends Request {
  body: SendGridEvent[];
}

interface SendGridEvent {
  email: string;
  timestamp: number;
  event: string;
  'smtp-id'?: string;
  sg_event_id: string;
  sg_message_id: string;
  useragent?: string;
  ip?: string;
  url?: string;
  reason?: string;
  status?: string;
  response?: string;
  attempt?: string;
  category?: string[];
  asm_group_id?: number;
  asm_group_name?: string;
  bounce_classification?: string;
  cert_err?: boolean;
  tls?: boolean;
  url_offset?: {
    index: number;
    type: string;
  };
  newsletter?: {
    newsletter_user_list_id: string;
    newsletter_id: string;
    newsletter_send_id: string;
  };
  marketing_campaign_id?: string;
  marketing_campaign_name?: string;
}

export class SendGridWebhookHandler {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.SENDGRID_WEBHOOK_SECRET!;
    if (!this.webhookSecret) {
      throw new Error('SENDGRID_WEBHOOK_SECRET environment variable is required');
    }
  }

  verifySignature(body: string, signature: string, timestamp: string): boolean {
    try {
      const payload = timestamp + body;
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );
    } catch (err) {
      console.error('SendGrid webhook signature verification failed:', err);
      return false;
    }
  }

  async handleEvents(events: SendGridEvent[]): Promise<void> {
    console.log(`Processing ${events.length} SendGrid webhook events`);

    for (const event of events) {
      try {
        await this.handleEvent(event);
      } catch (error) {
        console.error(`Failed to process SendGrid event ${event.sg_event_id}:`, error);
      }
    }
  }

  private async handleEvent(event: SendGridEvent): Promise<void> {
    console.log(`Processing SendGrid event: ${event.event} for ${event.email}`);

    switch (event.event) {
      case 'delivered':
        await this.handleDelivered(event);
        break;

      case 'bounce':
        await this.handleBounce(event);
        break;

      case 'dropped':
        await this.handleDropped(event);
        break;

      case 'deferred':
        await this.handleDeferred(event);
        break;

      case 'processed':
        await this.handleProcessed(event);
        break;

      case 'open':
        await this.handleOpen(event);
        break;

      case 'click':
        await this.handleClick(event);
        break;

      case 'spam_report':
        await this.handleSpamReport(event);
        break;

      case 'unsubscribe':
        await this.handleUnsubscribe(event);
        break;

      case 'group_unsubscribe':
        await this.handleGroupUnsubscribe(event);
        break;

      case 'group_resubscribe':
        await this.handleGroupResubscribe(event);
        break;

      default:
        console.log(`Unhandled SendGrid event type: ${event.event}`);
    }

    await this.logEvent(event);
  }

  private async handleDelivered(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      await this.updateEmailStatus(client, event, 'delivered');

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          last_email_delivered_at = $1,
          delivery_count = delivery_count + 1,
          updated_at = NOW()
        WHERE email = $2
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.email
      ]);
    });
  }

  private async handleBounce(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      await this.updateEmailStatus(client, event, 'bounced', event.reason);

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          bounce_count = bounce_count + 1,
          last_bounce_at = $1,
          bounce_reason = $2,
          status = CASE
            WHEN bounce_count >= 3 THEN 'bounced'
            ELSE status
          END,
          updated_at = NOW()
        WHERE email = $3
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.reason || 'Unknown bounce reason',
        event.email
      ]);

      if (event.bounce_classification === 'hard') {
        const hardBounceQuery = `
          UPDATE newsletter_subscribers SET
            status = 'bounced',
            unsubscribed_at = NOW()
          WHERE email = $1
        `;
        await client.query(hardBounceQuery, [event.email]);
      }
    });
  }

  private async handleDropped(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      await this.updateEmailStatus(client, event, 'dropped', event.reason);

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          bounce_count = bounce_count + 1,
          last_bounce_at = $1,
          bounce_reason = $2,
          updated_at = NOW()
        WHERE email = $3
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.reason || 'Email dropped',
        event.email
      ]);
    });
  }

  private async handleDeferred(event: SendGridEvent): Promise<void> {
    await this.updateEmailStatus(null, event, 'deferred', event.response);
  }

  private async handleProcessed(event: SendGridEvent): Promise<void> {
    await this.updateEmailStatus(null, event, 'processed');
  }

  private async handleOpen(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      const insertOpenQuery = `
        INSERT INTO email_opens (
          id, email, sg_message_id, sg_event_id, timestamp,
          user_agent, ip_address, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (sg_event_id) DO NOTHING
      `;

      await client.query(insertOpenQuery, [
        crypto.randomUUID(),
        event.email,
        event.sg_message_id,
        event.sg_event_id,
        new Date(event.timestamp * 1000),
        event.useragent,
        event.ip
      ]);

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          open_count = open_count + 1,
          last_opened_at = $1,
          updated_at = NOW()
        WHERE email = $2
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.email
      ]);

      if (event.marketing_campaign_id) {
        const updateCampaignQuery = `
          UPDATE email_campaigns SET
            opens = opens + 1,
            updated_at = NOW()
          WHERE sendgrid_campaign_id = $1
        `;

        await client.query(updateCampaignQuery, [event.marketing_campaign_id]);
      }
    });
  }

  private async handleClick(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      const insertClickQuery = `
        INSERT INTO email_clicks (
          id, email, sg_message_id, sg_event_id, url, timestamp,
          user_agent, ip_address, url_offset, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (sg_event_id) DO NOTHING
      `;

      await client.query(insertClickQuery, [
        crypto.randomUUID(),
        event.email,
        event.sg_message_id,
        event.sg_event_id,
        event.url,
        new Date(event.timestamp * 1000),
        event.useragent,
        event.ip,
        JSON.stringify(event.url_offset)
      ]);

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          click_count = click_count + 1,
          last_clicked_at = $1,
          updated_at = NOW()
        WHERE email = $2
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.email
      ]);

      if (event.marketing_campaign_id) {
        const updateCampaignQuery = `
          UPDATE email_campaigns SET
            clicks = clicks + 1,
            updated_at = NOW()
          WHERE sendgrid_campaign_id = $1
        `;

        await client.query(updateCampaignQuery, [event.marketing_campaign_id]);
      }
    });
  }

  private async handleSpamReport(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      await this.updateEmailStatus(client, event, 'spam');

      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          status = 'spam_complaint',
          spam_complaint_at = $1,
          unsubscribed_at = $1,
          updated_at = NOW()
        WHERE email = $2
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.email
      ]);
    });
  }

  private async handleUnsubscribe(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      const updateSubscriberQuery = `
        UPDATE newsletter_subscribers SET
          status = 'unsubscribed',
          unsubscribed_at = $1,
          unsubscribe_reason = 'user_request',
          updated_at = NOW()
        WHERE email = $2
      `;

      await client.query(updateSubscriberQuery, [
        new Date(event.timestamp * 1000),
        event.email
      ]);
    });
  }

  private async handleGroupUnsubscribe(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      const insertGroupUnsubQuery = `
        INSERT INTO email_group_unsubscribes (
          id, email, group_id, group_name, timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (email, group_id) DO UPDATE SET
          timestamp = EXCLUDED.timestamp,
          updated_at = NOW()
      `;

      await client.query(insertGroupUnsubQuery, [
        crypto.randomUUID(),
        event.email,
        event.asm_group_id,
        event.asm_group_name,
        new Date(event.timestamp * 1000)
      ]);
    });
  }

  private async handleGroupResubscribe(event: SendGridEvent): Promise<void> {
    await database.transaction(async (client) => {
      const deleteGroupUnsubQuery = `
        DELETE FROM email_group_unsubscribes
        WHERE email = $1 AND group_id = $2
      `;

      await client.query(deleteGroupUnsubQuery, [
        event.email,
        event.asm_group_id
      ]);
    });
  }

  private async updateEmailStatus(
    client: any,
    event: SendGridEvent,
    status: string,
    reason?: string
  ): Promise<void> {
    const updateQuery = `
      UPDATE email_sends SET
        status = $1,
        status_reason = $2,
        status_updated_at = $3,
        updated_at = NOW()
      WHERE sg_message_id = $4
    `;

    const queryClient = client || database;
    await queryClient.query(updateQuery, [
      status,
      reason,
      new Date(event.timestamp * 1000),
      event.sg_message_id
    ]);
  }

  private async logEvent(event: SendGridEvent): Promise<void> {
    const insertLogQuery = `
      INSERT INTO sendgrid_webhook_logs (
        id, sg_event_id, sg_message_id, email, event_type,
        timestamp, data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (sg_event_id) DO NOTHING
    `;

    await database.query(insertLogQuery, [
      crypto.randomUUID(),
      event.sg_event_id,
      event.sg_message_id,
      event.email,
      event.event,
      new Date(event.timestamp * 1000),
      JSON.stringify(event)
    ]);
  }
}

export const sendgridWebhookHandler = async (req: SendGridWebhookRequest, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

    if (!signature || !timestamp) {
      res.status(400).json({
        error: 'Missing headers',
        message: 'SendGrid signature and timestamp headers are required'
      });
      return;
    }

    const webhookHandler = new SendGridWebhookHandler();
    const body = JSON.stringify(req.body);

    if (!webhookHandler.verifySignature(body, signature, timestamp)) {
      res.status(401).json({
        error: 'Invalid signature',
        message: 'SendGrid webhook signature verification failed'
      });
      return;
    }

    await webhookHandler.handleEvents(req.body);

    res.status(200).json({
      processed: req.body.length,
      message: 'Events processed successfully'
    });
  } catch (error) {
    console.error('SendGrid webhook error:', error);

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