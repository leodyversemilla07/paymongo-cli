import * as crypto from 'node:crypto';
import * as http from 'node:http';
import chalk from 'chalk';
import type { PayMongoConfig, WebhookEventPayload } from '../../types/paymongo.js';
import Logger from '../../utils/logger.js';
import { AnalyticsService } from '../analytics/service.js';

/**
 * Development server for receiving PayMongo webhooks locally.
 * Handles HTTP requests, webhook signature verification, and analytics.
 */
export class DevServer {
  private server: http.Server;
  private port: number;
  private config: PayMongoConfig;
  private analytics: AnalyticsService;
  private logger: Logger;

  constructor(port: number, config: PayMongoConfig) {
    this.port = port;
    this.config = config;
    this.analytics = new AnalyticsService(config);
    this.logger = new Logger();

    this.server = http.createServer((req, res) => {
      this.handleWebhookRequest(req, res);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.logger.success(`Webhook server listening on http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(new Error(`Failed to start server on port ${this.port}: ${error.message}`));
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.warning('Webhook server stopped');
        resolve();
      });
    });
  }

  private handleWebhookRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Accept both /webhook and /webhook/{project-slug} paths
    const isWebhookPath = req.url?.startsWith('/webhook');
    if (req.method !== 'POST' || !isWebhookPath) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      void this.processWebhookBody(body, req, res);
    });
  }

  private async processWebhookBody(
    body: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const event = JSON.parse(body);

      // Verify webhook signature if enabled
      const signatureValid = this.verifyWebhookSignature(req, body, event);
      if (!signatureValid) {
        this.logger.failure('Webhook signature verification failed');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));

        // Record failed analytics event
        await this.analytics.recordEvent({
          type: event.data?.type || 'unknown',
          success: false,
          error: 'Invalid signature',
          data: event.data?.attributes,
        });
        return;
      }

      // Log the webhook event
      await this.logWebhookEvent(event);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      this.logger.error('Failed to process webhook:', (error as Error).message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));

      // Record failed analytics event for JSON parsing errors
      await this.analytics.recordEvent({
        type: 'unknown',
        success: false,
        error: 'Invalid JSON',
      });
    }
  }

  private async logWebhookEvent(event: WebhookEventPayload): Promise<void> {
    const timestamp = new Date().toLocaleTimeString();
    const eventType = event.data?.type || 'unknown';
    const eventId = event.data?.id || 'unknown';
    const isPaymentEvent = eventType.startsWith('payment');

    // Record analytics event
    await this.analytics.recordEvent({
      type: eventType,
      success: true,
      data: event.data?.attributes,
    });

    console.log('');
    console.log(chalk.gray('────────────────────────────────────────────────────────────'));
    console.log(chalk.blue(`[${timestamp}]`), chalk.bold(eventType.toUpperCase()));

    if (isPaymentEvent) {
      const attributes = event.data.attributes as { amount?: number; status?: string };
      const amount = attributes.amount ?? 0;
      const status = attributes.status ?? 'unknown';

      console.log(chalk.gray('└─'), `Amount: ₱${(amount / 100).toFixed(2)}`);
      console.log(chalk.gray('└─'), `Status: ${status}`);
      console.log(chalk.gray('└─'), `Payment ID: ${eventId}`);
    }

    console.log(
      chalk.gray('└─'),
      `View: https://dashboard.paymongo.com/${isPaymentEvent ? 'payments' : 'webhooks'}/${eventId}`
    );
  }

  private verifyWebhookSignature(
    req: http.IncomingMessage,
    body: string,
    event?: WebhookEventPayload
  ): boolean {
    // Check if signature verification is enabled in config
    if (!this.config.dev.verifyWebhookSignatures) {
      this.logger.warn('Webhook signature verification disabled in config');
      return true; // Allow all requests when verification is disabled
    }

    const signatureHeader = req.headers['paymongo-signature'] as string;
    if (!signatureHeader) {
      this.logger.failure('Signature verification required but no signature header found');
      return false;
    }

    // Parse signature header: t=<timestamp>,te=<test-signature>,li=<live-signature>
    const signatureParts = signatureHeader.split(',');
    if (signatureParts.length < 2) {
      this.logger.failure('Invalid signature format');
      return false;
    }

    const timestamp = signatureParts.find((part) => part.startsWith('t='))?.split('=')[1];
    const testSignature = signatureParts.find((part) => part.startsWith('te='))?.split('=')[1];
    const liveSignature = signatureParts.find((part) => part.startsWith('li='))?.split('=')[1];
    const livemode = Boolean(
      (event?.data?.attributes as { livemode?: boolean } | undefined)?.livemode
    );
    const signature = livemode ? liveSignature : testSignature || liveSignature;

    if (!timestamp || !signature) {
      this.logger.failure('Missing timestamp or signature in header');
      return false;
    }

    const webhookSecrets = this.config.webhookSecrets || {};
    const secretKeys = Object.values(webhookSecrets).filter(
      (secret) => typeof secret === 'string' && secret.length > 0
    ) as string[];

    if (secretKeys.length === 0) {
      this.logger.failure('Signature verification enabled but no webhook secrets are configured');
      return false;
    }

    // Try to verify with each available secret
    let isValid = false;
    for (const secret of secretKeys) {
      try {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`${timestamp}.${body}`)
          .digest('hex');

        if (
          crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
          )
        ) {
          isValid = true;
          break;
        }
      } catch (_error) {}
    }

    if (isValid) {
      this.logger.success('Signature verified successfully');
      return true;
    } else {
      this.logger.failure('Signature verification failed');
      return false;
    }
  }
}

export default DevServer;
