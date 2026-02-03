import Table from 'cli-table3';
import { Command } from 'commander';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import Spinner from '../utils/spinner.js';
import Logger from '../utils/logger.js';
import WebhookEventStore, { StoredWebhookEvent } from '../utils/webhook-store.js';
import crypto from 'crypto';

interface WebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: Record<string, unknown>;
    };
  };
}

function buildSignatureHeader(
  config: { webhookSecrets?: Record<string, string>; registeredWebhooks?: { id: string; url: string }[] } | null,
  webhookUrl: string,
  body: string
): string | undefined {
  if (!config?.webhookSecrets || Object.keys(config.webhookSecrets).length === 0) {
    return undefined;
  }

  const registered = config.registeredWebhooks || [];
  const match = registered.find((w) => w.url === webhookUrl);
  const webhookId = match?.id;

  let secret: string | undefined;
  if (webhookId && config.webhookSecrets[webhookId]) {
    secret = config.webhookSecrets[webhookId];
  } else {
    const secrets = Object.values(config.webhookSecrets).filter(
      (value) => typeof value === 'string' && value.length > 0
    );
    secret = secrets[0];
  }

  if (!secret) {
    return undefined;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  const parts = [`t=${timestamp}`, `te=${signature}`];
  if (webhookId) {
    parts.push(`li=${webhookId}`);
  }

  return parts.join(',');
}

const command = new Command('trigger');

command
  .description('Simulate webhook events locally')
  .addCommand(
    new Command('send')
      .description('Send a new webhook event')
      .option('-e, --event <event>', 'Webhook event type to trigger')
      .option('-u, --url <url>', 'Webhook URL to send to (defaults to config)')
      .option('-j, --json', 'Output event data as JSON')
      .action(async (options) => {
        // Existing send logic will go here
        await sendWebhookEvent(options);
      })
  )
  .addCommand(
    new Command('replay')
      .description('Replay a previously sent webhook event')
      .arguments('[eventId]')
      .option('-e, --event <event>', 'Event type to replay (shows recent events of this type)')
      .option('-u, --url <url>', 'Webhook URL to send to (defaults to original URL)')
      .option('-l, --list', 'List recent webhook events')
      .option('-j, --json', 'Output as JSON')
      .action(async (eventId, options) => {
        await replayWebhookEvent(eventId, options);
      })
  )
  .addCommand(
    new Command('clear').description('Clear stored webhook events').action(async () => {
      const store = new WebhookEventStore();
      await store.clearEvents();
      console.log(chalk.green('✓ Cleared all stored webhook events'));
    })
  );

// Legacy support - keep the root command working for backward compatibility
command
  .option('-e, --event <event>', 'Webhook event type to trigger')
  .option('-u, --url <url>', 'Webhook URL to send to (defaults to config)')
  .option('-j, --json', 'Output event data as JSON')
  .action(async (options) => {
    if (Object.keys(options).length > 0) {
      // If any options are provided, use the legacy send behavior
      await sendWebhookEvent(options);
    } else {
      // Show help if no options provided
      command.help();
    }
  });

/**
 * Send a webhook event to the configured URL
 */
async function sendWebhookEvent(options: { event?: string; url?: string; json?: boolean }) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();
  const logger = new Logger();

  try {
    const config = await configManager.load();

    // Available webhook events
    const availableEvents = [
      'payment.paid',
      'payment.failed',
      'payment.refunded',
      'payment.refund.updated',
      'source.chargeable',
      'checkout_session.payment.paid',
      'link.payment.paid',
      'qrph.expired',
    ];

    let selectedEvent = options.event;
    let webhookUrl = options.url || config?.webhooks?.url;

    // Interactive mode if no event specified
    if (!selectedEvent) {
      spinner.stop();

      // Lazy load @inquirer/prompts
      const { select, input } = await import('@inquirer/prompts');

      const eventChoice = await select({
        message: 'Select webhook event to trigger:',
        choices: availableEvents.map((event) => ({
          name: event,
          value: event,
        })),
      });

      const urlInput = await input({
        message: 'Webhook URL:',
        default: webhookUrl || '',
        validate: (value: string) => {
          try {
            new URL(value);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      });

      selectedEvent = eventChoice;
      webhookUrl = urlInput || webhookUrl;
    }

    if (!webhookUrl) {
      console.error(
        chalk.red('❌ No webhook URL provided. Use --url option or configure in .paymongo file')
      );
      process.exit(1);
    }

    if (!selectedEvent) {
      console.error(chalk.red('❌ No event selected'));
      process.exit(1);
    }

    spinner.start('Generating webhook payload...');

    // Generate webhook payload based on event type
    const webhookPayload = generateWebhookPayload(selectedEvent);

    if (options.json) {
      console.log(JSON.stringify(webhookPayload, null, 2));
      return;
    }

    spinner.succeed('Webhook event generated');

    // Display event information
    console.log(chalk.bold.blue('\n🚀 Webhook Event Trigger'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('Event:')} ${chalk.cyan(selectedEvent)}`);
    console.log(`${chalk.bold('URL:')} ${chalk.yellow(webhookUrl)}`);
    console.log(`${chalk.bold('Timestamp:')} ${new Date().toISOString()}`);

    // Display payload preview
    console.log(chalk.gray('\nPayload:'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(JSON.stringify(webhookPayload, null, 2));

    // Store the event for replay functionality
    const store = new WebhookEventStore();
    await store.storeEvent({
      id: webhookPayload.data.id,
      event: selectedEvent,
      url: webhookUrl,
      payload: webhookPayload,
      timestamp: Math.floor(Date.now() / 1000),
      status: 'delivered',
    });

    // Simulate sending to webhook URL
    spinner.start('Sending webhook...');

    try {
      const { request } = await import('undici');
      const body = JSON.stringify(webhookPayload);
      const signatureHeader = buildSignatureHeader(config, webhookUrl, body);
      const response = await request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PayMongo-CLI/1.0.0',
          ...(signatureHeader ? { 'paymongo-signature': signatureHeader } : {}),
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      // Validate HTTP response status
      if (response.statusCode >= 200 && response.statusCode < 300) {
        spinner.succeed(`Webhook delivered successfully (HTTP ${response.statusCode})`);

        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const responseData = await response.body.json();
          console.log(chalk.gray('\nResponse:'));
          console.log(chalk.gray('─'.repeat(30)));
          console.log(JSON.stringify(responseData, null, 2));
        }
      } else if (response.statusCode === 404) {
        spinner.fail(`Webhook endpoint not found (HTTP 404)`);
        console.log('');
        console.log(chalk.red('❌ The webhook URL returned 404 Not Found'));
        console.log('');
        console.log(chalk.yellow('💡 Possible causes:'));
        console.log(chalk.gray('  • The webhook endpoint path is incorrect'));
        console.log(chalk.gray('  • Your server is not running'));
        console.log(chalk.gray('  • The route is not registered in your application'));
        console.log('');
        console.log(chalk.yellow('💡 To fix:'));
        console.log(chalk.gray(`  • Verify your server has a POST handler at: ${webhookUrl}`));
        console.log(chalk.gray('  • Check that your server is running and accessible'));
        process.exit(1);
      } else if (response.statusCode >= 400 && response.statusCode < 500) {
        spinner.fail(`Webhook rejected by server (HTTP ${response.statusCode})`);
        console.log('');
        console.log(chalk.red(`❌ Server returned client error: ${response.statusCode}`));
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const responseData = await response.body.json();
          console.log(chalk.gray('\nServer response:'));
          console.log(JSON.stringify(responseData, null, 2));
        }
        console.log('');
        console.log(chalk.yellow('💡 Common causes:'));
        console.log(chalk.gray('  • Invalid request format or headers'));
        console.log(chalk.gray('  • Authentication/authorization failure'));
        console.log(chalk.gray('  • Webhook signature verification failed'));
        process.exit(1);
      } else if (response.statusCode >= 500) {
        spinner.fail(`Webhook endpoint error (HTTP ${response.statusCode})`);
        console.log('');
        console.log(chalk.red(`❌ Server returned error: ${response.statusCode}`));
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const responseData = await response.body.json();
          console.log(chalk.gray('\nServer response:'));
          console.log(JSON.stringify(responseData, null, 2));
        }
        console.log('');
        console.log(chalk.yellow('💡 This is a server-side error. Check:'));
        console.log(chalk.gray('  • Server logs for the specific error'));
        console.log(chalk.gray('  • Webhook handler code for exceptions'));
        process.exit(1);
      }
    } catch (error) {
      const err = error as Error & {
        code?: string;
        response?: { status: number; data?: unknown };
      };

      if (err.code === 'ECONNREFUSED') {
        spinner.fail('Connection refused');
        console.log('');
        console.log(chalk.red('❌ Could not connect to webhook URL'));
        console.log('');
        console.log(chalk.yellow('💡 Possible causes:'));
        console.log(chalk.gray('  • Server is not running'));
        console.log(chalk.gray('  • Wrong port number'));
        console.log(chalk.gray('  • Firewall blocking the connection'));
        console.log('');
        console.log(chalk.yellow('💡 To fix:'));
        console.log(chalk.gray('  • Start your local server'));
        console.log(chalk.gray(`  • Verify the server is listening on the correct port`));
        process.exit(1);
      } else if (err.code === 'ENOTFOUND') {
        spinner.fail('Host not found');
        console.log('');
        console.log(chalk.red('❌ Could not resolve webhook URL hostname'));
        console.log('');
        console.log(chalk.yellow('💡 Check:'));
        console.log(chalk.gray('  • The URL is spelled correctly'));
        console.log(chalk.gray('  • Your internet connection is working'));
        console.log(chalk.gray('  • DNS is resolving correctly'));
        process.exit(1);
      } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        spinner.fail('Request timed out');
        console.log('');
        console.log(chalk.red('❌ Webhook request timed out after 10 seconds'));
        console.log('');
        console.log(chalk.yellow('💡 Possible causes:'));
        console.log(chalk.gray('  • Server is taking too long to respond'));
        console.log(chalk.gray('  • Network latency issues'));
        console.log(chalk.gray('  • Server is stuck or deadlocked'));
        console.log('');
        console.log(chalk.yellow('💡 To fix:'));
        console.log(chalk.gray('  • Check your webhook handler for slow operations'));
        console.log(chalk.gray('  • Ensure async operations are handled properly'));
        process.exit(1);
      } else {
        spinner.fail(`Webhook delivery failed: ${err.message}`);
        console.log('');
        console.log(chalk.red('❌ Unexpected error occurred'));
        console.log(chalk.gray(`   Error: ${err.message}`));
        if (err.code) {
          console.log(chalk.gray(`   Code: ${err.code}`));
        }
        process.exit(1);
      }
    }
  } catch (error) {
    const err = error as Error;
    spinner.fail('Failed to trigger webhook event');
    logger.error('Trigger command error:', err.message);
    process.exit(1);
  }
}

/**
 * Generate webhook payload based on event type
 */
function generateWebhookPayload(eventType: string): WebhookPayload {
  const basePayload = {
    data: {
      id: `evt_${generateId()}`,
      type: 'event',
      attributes: {
        type: eventType,
        livemode: false,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        data: {},
      },
    },
  };

  switch (eventType) {
    case 'payment.paid':
      basePayload.data.attributes.data = {
        id: `pay_${generateId()}`,
        type: 'payment',
        attributes: {
          amount: 100000, // ₱1,000.00 in centavos
          currency: 'PHP',
          description: 'Test Payment',
          status: 'paid',
          external_reference_number: null,
          paid_at: Math.floor(Date.now() / 1000),
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          fees: 2950, // ₱29.50 in centavos
          net_amount: 97050, // ₱970.50 in centavos
          payment_intent_id: `pi_${generateId()}`,
          source: {
            id: `src_${generateId()}`,
            type: 'source',
            attributes: {
              amount: 100000,
              currency: 'PHP',
              status: 'paid',
              type: 'gcash',
              created_at: Math.floor(Date.now() / 1000),
              updated_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };
      break;

    case 'payment.failed':
      basePayload.data.attributes.data = {
        id: `pay_${generateId()}`,
        type: 'payment',
        attributes: {
          amount: 50000, // ₱500.00 in centavos
          currency: 'PHP',
          description: 'Failed Test Payment',
          status: 'failed',
          external_reference_number: null,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          fees: 0,
          net_amount: 0,
          payment_intent_id: `pi_${generateId()}`,
          source: {
            id: `src_${generateId()}`,
            type: 'source',
            attributes: {
              amount: 50000,
              currency: 'PHP',
              status: 'failed',
              type: 'card',
              created_at: Math.floor(Date.now() / 1000),
              updated_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };
      break;

    case 'source.chargeable':
      basePayload.data.attributes.data = {
        id: `src_${generateId()}`,
        type: 'source',
        attributes: {
          amount: 150000, // ₱1,500.00
          currency: 'PHP',
          status: 'chargeable',
          type: 'gcash',
          billing: {
            address: {
              city: 'Manila',
              country: 'PH',
              line1: '123 Test Street',
              line2: null,
              postal_code: '1000',
              state: 'Metro Manila',
            },
            email: 'test@example.com',
            name: 'Test User',
            phone: '+639123456789',
          },
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        },
      };
      break;

    case 'checkout_session.payment.paid':
      basePayload.data.attributes.data = {
        id: `cs_${generateId()}`,
        type: 'checkout_session',
        attributes: {
          amount: 200000, // ₱2,000.00
          currency: 'PHP',
          description: 'Test Checkout Session',
          status: 'paid',
          payment_intent_id: `pi_${generateId()}`,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        },
      };
      break;

    case 'link.payment.paid':
      basePayload.data.attributes.data = {
        id: `plink_${generateId()}`,
        type: 'link',
        attributes: {
          amount: 75000, // ₱750.00
          currency: 'PHP',
          description: 'Test Payment Link',
          status: 'paid',
          archived: false,
          payment_intent_id: `pi_${generateId()}`,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        },
      };
      break;

    default:
      // Generic payload for other events
      basePayload.data.attributes.data = {
        id: `${eventType.split('.')[1]}_${generateId()}`,
        type: eventType.split('.')[0],
        attributes: {
          status: 'test',
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        },
      };
  }

  return basePayload;
}

/**
 * Replay a previously sent webhook event
 */
async function replayWebhookEvent(
  eventId: string | undefined,
  options: {
    event?: string;
    url?: string;
    list?: boolean;
    json?: boolean;
  }
) {
  const store = new WebhookEventStore();
  const configManager = new ConfigManager();
  const config = await configManager.load();

  try {
    // List mode - show recent events
    if (options.list || (!eventId && !options.event)) {
      const events = await store.loadEvents();

      if (options.json) {
        console.log(JSON.stringify(events, null, 2));
        return;
      }

      if (events.length === 0) {
        console.log(chalk.yellow('No webhook events stored yet.'));
        console.log(chalk.gray('Use "paymongo trigger send" to send events first.'));
        return;
      }

      console.log(chalk.bold.blue('\n📋 Stored Webhook Events'));
      console.log(chalk.gray('─'.repeat(95)));
      const table = new Table({
        head: [chalk.bold('ID'), chalk.bold('Event'), chalk.bold('Timestamp')],
        colWidths: [25, 30, 25],
        style: {
          head: [],
          border: [],
        },
      });

      events.slice(0, 10).forEach((event: StoredWebhookEvent) => {
        const id = event.id.substring(0, 22) + (event.id.length > 22 ? '...' : '');
        const eventType = event.event;
        const timestamp = new Date(event.timestamp * 1000).toLocaleString();

        table.push([chalk.cyan(id), chalk.yellow(eventType), chalk.gray(timestamp)]);
      });

      console.log(table.toString());

      if (events.length > 10) {
        console.log(
          chalk.gray(`\n... and ${events.length - 10} more events. Use --list to see all.`)
        );
      }

      console.log(
        chalk.gray('\n💡 Use "paymongo trigger replay <eventId>" to replay a specific event')
      );
      return;
    }

    // Replay by event type - show matching events
    if (options.event && !eventId) {
      const events = await store.loadEvents();
      const matchingEvents = events.filter((e: StoredWebhookEvent) => e.event === options.event);

      if (matchingEvents.length === 0) {
        console.log(chalk.yellow(`No events found for type: ${options.event}`));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(matchingEvents, null, 2));
        return;
      }

      console.log(chalk.bold.blue(`\n📋 Recent "${options.event}" Events`));
      console.log(chalk.gray('─'.repeat(60)));
      matchingEvents.slice(0, 5).forEach((event: StoredWebhookEvent, index: number) => {
        const id = event.id;
        const timestamp = new Date(event.timestamp * 1000).toLocaleString();
        console.log(
          `${chalk.cyan((index + 1).toString() + '.')} ${chalk.yellow(id)} - ${chalk.gray(timestamp)}`
        );
      });

      console.log(
        chalk.gray('\n💡 Use "paymongo trigger replay <eventId>" to replay a specific event')
      );
      return;
    }

    // Replay specific event
    if (eventId) {
      const event = await store.getEventById(eventId);

      if (!event) {
        console.log(chalk.red(`❌ Event not found: ${eventId}`));
        console.log(chalk.gray('Use "paymongo trigger replay --list" to see available events.'));
        process.exit(1);
      }

      // Use provided URL or original URL
      const webhookUrl = options.url || event.url;

      console.log(chalk.bold.blue('\n🔄 Replaying Webhook Event'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.bold('Event ID:')} ${chalk.cyan(event.id)}`);
      console.log(`${chalk.bold('Event Type:')} ${chalk.yellow(event.event)}`);
      console.log(`${chalk.bold('URL:')} ${chalk.yellow(webhookUrl)}`);
      console.log(
        `${chalk.bold('Original Time:')} ${chalk.gray(new Date(event.timestamp * 1000).toISOString())}`
      );

      const spinner = new Spinner();
      spinner.start('Sending webhook...');

      try {
        const { request } = await import('undici');
        const body = JSON.stringify(event.payload);
        const signatureHeader = buildSignatureHeader(config, webhookUrl, body);
        const response = await request(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PayMongo-CLI/1.0.0',
            ...(signatureHeader ? { 'paymongo-signature': signatureHeader } : {}),
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
          spinner.succeed(`Webhook replayed successfully (HTTP ${response.statusCode})`);

          const contentType = response.headers['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const responseData = await response.body.json();
            if (!options.json) {
              console.log(chalk.gray('\nResponse:'));
              console.log(chalk.gray('─'.repeat(30)));
              console.log(JSON.stringify(responseData, null, 2));
            }
          }
        } else {
          spinner.fail(`Webhook replay failed (HTTP ${response.statusCode})`);
          console.log(chalk.red(`Server responded with: ${response.statusCode}`));
          process.exit(1);
        }
      } catch (error) {
        const err = error as Error & { code?: string };
        spinner.fail('Webhook replay failed');

        if (err.code === 'ECONNREFUSED') {
          console.log(chalk.red('❌ Could not connect to webhook URL'));
        } else {
          console.log(chalk.red(`❌ Error: ${err.message}`));
        }
        process.exit(1);
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red(`❌ Failed to replay webhook: ${err.message}`));
    process.exit(1);
  }
}

/**
 * Generate a random ID-like string
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default command;
