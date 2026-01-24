import { Command } from 'commander';
import * as http from 'http';
import * as crypto from 'crypto';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager';
import ApiClient from '../services/api/client';
import Spinner from '../utils/spinner';
import { withRetry } from '../utils/errors';

interface DevOptions {
  port?: string;
  noRegister?: boolean;
  events?: string;
}

class DevServer {
  private server: http.Server;
  private port: number;
  private config: any;

  constructor(port: number, config: any) {
    this.port = port;
    this.config = config;

    this.server = http.createServer((req, res) => {
      this.handleWebhookRequest(req, res);
    });
  }

  async start(): Promise<void> {
    // Start HTTP server
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
    if (req.method !== 'POST' || req.url !== '/webhook') {
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
      }
    });
  }

  private logWebhookEvent(event: any): void {
    const timestamp = new Date().toLocaleTimeString();
    const eventType = event.data?.type || 'unknown';
    const eventId = event.data?.id || 'unknown';

    console.log('');
    console.log(chalk.gray('────────────────────────────────────────────────────────────'));
    console.log(chalk.blue(`[${timestamp}]`), chalk.bold(eventType.toUpperCase()));

    if (eventType === 'payment') {
      const amount = event.data.attributes.amount;
      const status = event.data.attributes.status;

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

    // For now, look for any webhook secret in config
    // TODO: In production, this should be more sophisticated - match webhook URL or ID
    const webhookSecrets = this.config.webhookSecrets || {};
    const secretKeys = Object.values(webhookSecrets) as string[];

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
      } catch (error) {
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

const command = new Command('dev');

command
  .description('Start local development server')
  .option('-p, --port <port>', 'Port to run the webhook server on', '3000')
  .option('--no-register', 'Skip automatic webhook registration')
  .option(
    '-e, --events <events>',
    'Comma-separated events to listen for',
    'payment.paid,payment.failed'
  )
  .action(async (options: DevOptions) => {
    const spinner = new Spinner();
    const configManager = new ConfigManager();

    try {
      // Load configuration
      spinner.start('Loading configuration...');
      const config = await configManager.load();

      if (!config) {
        spinner.fail('No configuration found');
        console.log(chalk.yellow('No PayMongo configuration found.'));
        console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
        return;
      }

      spinner.succeed('Configuration loaded');

      // Start ngrok tunnel
      spinner.start('Creating tunnel...');
      const port = parseInt(options.port || '3000');

      // Lazy load ngrok to reduce startup time
      const { default: ngrok } = await import('ngrok');

      const tunnelUrl = await withRetry(() => ngrok.connect(port), {
        maxRetries: 3,
        delayMs: 2000,
        retryCondition: (error: Error) => {
          // Retry on network errors and common ngrok issues
          return (
            error.message.includes('connection') ||
            error.message.includes('timeout') ||
            error.message.includes('tunnel') ||
            error.message.includes('ngrok')
          );
        },
      });
      spinner.succeed('Tunnel created');

      // Start webhook server
      const devServer = new DevServer(port, config);
      await devServer.start();

      // Register webhook (unless disabled)
      let webhookId: string | undefined;
      if (!options.noRegister) {
        spinner.start('Registering webhook...');
        const events = (options.events || 'payment.paid,payment.failed').split(',');
        const webhookUrl = `${tunnelUrl}/webhook`;

        try {
          const webhook = await new ApiClient({ config }).createWebhook(webhookUrl, events);
          webhookId = webhook.id;

          // Store webhook secret if available
          if (webhook.attributes?.secret) {
            config.webhookSecrets = config.webhookSecrets || {};
            config.webhookSecrets[webhook.id] = webhook.attributes.secret;
            await configManager.save(config);
            spinner.succeed(`Webhook registered: ${webhookId} (with signature verification)`);
          } else {
            spinner.succeed(`Webhook registered: ${webhookId}`);
          }
        } catch (error) {
          const err = error as Error;
          spinner.warn('Webhook registration failed - server will start without webhook');

          console.log(chalk.yellow('⚠️'), 'Webhook registration failed:', err.message);
          console.log('');
          console.log(chalk.blue('ℹ️'), 'You can still test webhooks manually:');
          console.log(chalk.gray(`   Webhook URL: ${webhookUrl}`));
          console.log(chalk.gray('   Copy this URL to your PayMongo dashboard'));
          console.log('');

          if (err.message.includes('API key') || err.message.includes('unauthorized')) {
            console.log(chalk.yellow('💡 To fix webhook registration:'));
            console.log(chalk.gray('   1. Run "paymongo login" to update your API keys'));
            console.log(chalk.gray('   2. Restart the development server'));
          }
        }
      }

      // Display status
      console.log('\n' + chalk.green('🚀 PayMongo Development Server'));
      console.log('');
      console.log(chalk.green('✓'), `Tunnel: ${tunnelUrl}`);
      if (webhookId) {
        console.log(chalk.green('✓'), `Webhook: ${webhookId}`);
      }
      console.log(chalk.green('✓'), `Server: http://localhost:${port}/webhook`);
      console.log('');
      console.log(chalk.bold('Forwarding:'), `${tunnelUrl} → http://localhost:${port}`);
      console.log('');
      console.log(
        chalk.bold('Events:'),
        (options.events || 'payment.paid,payment.failed').split(',').join(', ')
      );
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop'));

      // Handle cleanup on exit
      const cleanup = async () => {
        console.log('\n' + chalk.yellow('Shutting down...'));

        try {
          // Disconnect ngrok
          const { default: ngrok } = await import('ngrok');
          await ngrok.disconnect();
          await ngrok.kill();
          console.log(chalk.yellow('✓'), 'Tunnel closed');

          // Stop server
          await devServer.stop();

          // Delete webhook
          if (webhookId) {
            spinner.start('Cleaning up webhook...');
            await new ApiClient({ config }).deleteWebhook(webhookId);
            spinner.succeed('Webhook deleted');
          }
        } catch (error) {
          console.error(chalk.red('Error during cleanup:'), (error as Error).message);
          console.log(chalk.yellow('⚠️'), 'Some cleanup tasks may not have completed');
        }

        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep the process running
      await new Promise(() => {}); // Never resolves
    } catch (error) {
      spinner.stop();
      const err = error as Error;

      // Provide actionable error messages based on error type
      if (err.message.includes('ngrok') || err.message.includes('tunnel')) {
        console.error(chalk.red('❌ Failed to create tunnel:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Troubleshooting suggestions:'));
        console.log(chalk.gray('• Check your internet connection'));
        console.log(chalk.gray('• Make sure ngrok is not blocked by firewall/antivirus'));
        console.log(chalk.gray('• Try a different port: paymongo dev --port 3001'));
        console.log(chalk.gray('• Visit https://ngrok.com for status updates'));
      } else if (err.message.includes('API key') || err.message.includes('unauthorized')) {
        console.error(chalk.red('❌ Authentication failed:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Solutions:'));
        console.log(chalk.gray('• Run "paymongo login" to update your API keys'));
        console.log(chalk.gray('• Check that your API keys are valid in the PayMongo dashboard'));
        console.log(chalk.gray("• Verify you're using the correct environment (test/live)"));
      } else if (err.message.includes('Network') || err.message.includes('connection')) {
        console.error(chalk.red('❌ Network error:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 Try again:'));
        console.log(chalk.gray('• Check your internet connection'));
        console.log(chalk.gray('• PayMongo API might be temporarily unavailable'));
        console.log(chalk.gray('• Wait a moment and try again'));
      } else {
        console.error(chalk.red('❌ Failed to start development server:'), err.message);
        console.log('');
        console.log(chalk.yellow('💡 For help, visit: https://developers.paymongo.com'));
      }

      // Cleanup on error
      try {
        const { default: ngrok } = await import('ngrok');
        await ngrok.disconnect();
        await ngrok.kill();
      } catch {}

      process.exit(1);
    }
  });

export default command;
