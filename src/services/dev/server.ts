import * as http from 'node:http';
import chalk from 'chalk';
import type { PayMongoConfig, WebhookEventPayload } from '../../types/paymongo.js';
import { NetworkError } from '../../utils/errors.js';
import Logger from '../../utils/logger.js';
import { verifyWebhook } from '../../utils/webhook-verifier.js';
import { AnalyticsService } from '../analytics/service.js';
import { FORWARDING_HOP_HEADER, validateForwardTarget, WebhookForwarder } from './forwarder.js';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export interface DevServerOptions {
  forwardTo?: string;
  forwardTimeoutMs?: number;
}

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
  private forwarder?: WebhookForwarder;

  constructor(port: number, config: PayMongoConfig, options: DevServerOptions = {}) {
    this.port = port;
    this.config = config;
    this.analytics = new AnalyticsService(config);
    this.logger = new Logger();
    if (options.forwardTo !== undefined) {
      validateForwardTarget(options.forwardTo, port);
      this.forwarder = new WebhookForwarder(options.forwardTo, options.forwardTimeoutMs);
    }

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
    this.forwarder?.close();
    return new Promise((resolve) => {
      const deadline = setTimeout(() => this.server.closeAllConnections(), 1000);
      this.server.close(() => {
        clearTimeout(deadline);
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

    if (req.headers[FORWARDING_HOP_HEADER] !== undefined) {
      res.writeHead(508, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forwarding loop detected' }));
      req.resume();
      return;
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    let oversized = false;
    let incomplete = false;
    req.on('data', (chunk: Buffer | string) => {
      if (oversized) return;
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytes += data.length;
      if (bytes > MAX_WEBHOOK_BYTES) {
        oversized = true;
        chunks.length = 0;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook body exceeds 1 MiB' }));
        return;
      }
      chunks.push(data);
    });
    req.on('error', () => {
      incomplete = true;
      chunks.length = 0;
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Incomplete webhook request' }));
      }
    });
    req.on('end', () => {
      if (oversized || incomplete) return;
      const rawBody = Buffer.concat(chunks);
      void this.processWebhookBody(rawBody.toString('utf8'), req, res, rawBody);
    });
  }

  private async processWebhookBody(
    body: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    rawBody: Buffer = Buffer.from(body)
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
          type: event.data?.attributes?.type || 'unknown',
          success: false,
          error: 'Invalid signature',
          data: event.data?.attributes,
        });
        return;
      }

      // Log the webhook event
      await this.logWebhookEvent(event);

      if (this.forwarder) {
        await this.forwardToApplication(rawBody, req, res);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch {
      // JSON parsing errors can include excerpts containing payment or billing data.
      this.logger.error('Failed to process webhook');
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

  private async forwardToApplication(
    body: Buffer,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const started = performance.now();
    try {
      const result = await this.forwarder?.forward(body, req.headers);
      if (!result) return;
      const successful = result.statusCode >= 200 && result.statusCode < 300;
      const message = `Application delivery: HTTP ${result.statusCode} (${result.durationMs}ms)`;
      if (successful) this.logger.success(message);
      else this.logger.failure(message);
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(successful ? 200 : 502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: successful,
          forwarded: successful,
          downstreamStatus: result.statusCode,
          durationMs: result.durationMs,
        })
      );
    } catch (error) {
      const timedOut =
        error instanceof NetworkError && error.message === 'Application forwarding timed out';
      const durationMs = Math.round(performance.now() - started);
      const message = timedOut ? 'Application delivery timed out' : 'Application delivery failed';
      this.logger.failure(`${message} (${durationMs}ms)`);
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message, forwarded: false, durationMs }));
    }
  }

  private async logWebhookEvent(event: WebhookEventPayload): Promise<void> {
    const timestamp = new Date().toLocaleTimeString();
    const eventType =
      typeof event.data?.attributes?.type === 'string' ? event.data.attributes.type : 'unknown';
    const eventId = event.data?.id || 'unknown';
    const resource = event.data?.attributes?.data as
      | { id?: string; type?: string; attributes?: { amount?: number; status?: string } }
      | undefined;
    const isPaymentEvent = resource?.type === 'payment';

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
      const attributes = resource?.attributes || {};
      const amount = attributes.amount ?? 0;
      const status = attributes.status ?? 'unknown';

      console.log(chalk.gray('└─'), `Amount: ₱${(amount / 100).toFixed(2)}`);
      console.log(chalk.gray('└─'), `Status: ${status}`);
      console.log(chalk.gray('└─'), `Payment ID: ${resource?.id || 'unknown'}`);
    }

    console.log(chalk.gray('└─'), `Event ID: ${eventId}`);
    if (isPaymentEvent && resource?.id) {
      console.log(chalk.gray('└─'), `View: https://dashboard.paymongo.com/payments/${resource.id}`);
    }
  }

  private verifyWebhookSignature(
    req: http.IncomingMessage,
    body: string,
    event?: WebhookEventPayload
  ): boolean {
    if (!this.config.dev.verifyWebhookSignatures) {
      this.logger.warn('Webhook signature verification disabled in config');
      return true;
    }

    const signatureHeader = req.headers['paymongo-signature'];
    if (typeof signatureHeader !== 'string') {
      this.logger.failure('Signature verification required but no signature header found');
      return false;
    }

    const secretKeys = Object.values(this.config.webhookSecrets || {}).filter(
      (secret) => typeof secret === 'string' && secret.length > 0
    );
    if (secretKeys.length === 0) {
      this.logger.failure('Signature verification enabled but no webhook secrets are configured');
      return false;
    }

    const isValid = secretKeys.some((secret) =>
      verifyWebhook(body, signatureHeader, secret, event)
    );
    if (isValid) {
      this.logger.success('Signature verified successfully');
    } else {
      this.logger.failure('Signature verification failed');
    }
    return isValid;
  }
}

export default DevServer;
