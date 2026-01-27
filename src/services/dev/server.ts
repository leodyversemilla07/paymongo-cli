import * as http from 'http';
import * as crypto from 'crypto';
import chalk from 'chalk';
import { PayMongoConfig, WebhookEventPayload } from '../../types/paymongo.js';
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

  constructor(port: number, config: PayMongoConfig) {
    this.port = port;
    this.config = config;
    this.analytics = new AnalyticsService(config);

    this.server = http.createServer((req, res) => {
      this.handleWebhookRequest(req, res);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(chalk.green('✓'), `Webhook server listening on http://localhost:${this.port}`);
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
        console.log(chalk.yellow('✓'), 'Webhook server stopped');
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
      try {
        const event = JSON.parse(body);

        // Verify webhook signature if enabled
        const signatureValid = this.verifyWebhookSignature(req, body);
        if (!signatureValid) {
          console.log(chalk.red('⚠️'), 'Webhook signature verification failed');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));

          // Record failed analytics event
          this.analytics.recordEvent({
            type: event.data?.type || 'unknown',
            success: false,
            error: 'Invalid signature',
            data: event.data?.attributes,
          });
          return;
        }

        // Log the webhook event
        this.logWebhookEvent(event);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error(chalk.red('✗'), 'Failed to process webhook:', (error as Error).message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));

        // Record failed analytics event for JSON parsing errors
        this.analytics.recordEvent({
          type: 'unknown',
          success: false,
          error: 'Invalid JSON',
        });
      }
    });
  }

  private logWebhookEvent(event: WebhookEventPayload): void {
    const timestamp = new Date().toLocaleTimeString();
    const eventType = event.data?.type || 'unknown';
    const eventId = event.data?.id || 'unknown';

    // Record analytics event
    this.analytics.recordEvent({
      type: eventType,
      success: true,
      data: event.data?.attributes,
    });

    console.log('');
    console.log(chalk.gray('────────────────────────────────────────────────────────────'));
    console.log(chalk.blue(`[${timestamp}]`), chalk.bold(eventType.toUpperCase()));

    if (eventType === 'payment') {
      const attributes = event.data.attributes as { amount?: number; status?: string };
      const amount = attributes.amount ?? 0;
      const status = attributes.status ?? 'unknown';

      console.log(chalk.gray('└─'), `Amount: ₱${(amount / 100).toFixed(2)}`);
      console.log(chalk.gray('└─'), `Status: ${status}`);
      console.log(chalk.gray('└─'), `Payment ID: ${eventId}`);
    }

    console.log(
      chalk.gray('└─'),
      `View: https://dashboard.paymongo.com/${eventType === 'payment' ? 'payments' : 'webhooks'}/${eventId}`
    );
  }

  private verifyWebhookSignature(req: http.IncomingMessage, body: string): boolean {
    // Check if signature verification is enabled in config
    if (!this.config.dev.verifyWebhookSignatures) {
      console.log(chalk.yellow('ℹ️'), 'Webhook signature verification disabled in config');
      return true; // Allow all requests when verification is disabled
    }

    const signatureHeader = req.headers['paymongo-signature'] as string;
    if (!signatureHeader) {
      console.log(chalk.red('⚠️'), 'Signature verification required but no signature header found');
      return false;
    }

    // Parse signature header: t=<timestamp>,te=<signature>,li=
    const signatureParts = signatureHeader.split(',');
    if (signatureParts.length < 2) {
      console.log(chalk.red('⚠️'), 'Invalid signature format');
      return false;
    }

    const timestamp = signatureParts.find((part) => part.startsWith('t='))?.split('=')[1];
    const signature = signatureParts.find((part) => part.startsWith('te='))?.split('=')[1];

    if (!timestamp || !signature) {
      console.log(chalk.red('⚠️'), 'Missing timestamp or signature in header');
      return false;
    }

    const webhookId = signatureParts.find((part) => part.startsWith('li='))?.split('=')[1];

    const webhookSecrets = this.config.webhookSecrets || {};
    const configuredSecret = webhookId ? webhookSecrets[webhookId] : undefined;
    let secretKeys: string[] = [];

    if (configuredSecret) {
      secretKeys = [configuredSecret];
    } else {
      secretKeys = Object.values(webhookSecrets).filter(
        (secret) => typeof secret === 'string' && secret.length > 0
      ) as string[];

      if (webhookId && secretKeys.length > 0) {
        console.log(
          chalk.yellow('⚠️'),
          `No webhook secret found for id ${webhookId}. Update your configuration.`
        );
        return false;
      }
    }

    if (secretKeys.length === 0) {
      console.log(
        chalk.yellow('⚠️'),
        'Signature verification enabled but no webhook secrets configured'
      );
      return true; // Allow requests when no secrets are configured yet
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
      } catch (_error) {
        // Continue trying other secrets
        continue;
      }
    }

    if (isValid) {
      console.log(chalk.green('✓'), 'Signature verified successfully');
      return true;
    } else {
      console.log(chalk.red('✗'), 'Signature verification failed');
      return false;
    }
  }
}

export default DevServer;
