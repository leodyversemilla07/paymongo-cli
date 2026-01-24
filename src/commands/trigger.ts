import { Command } from 'commander';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ConfigManager from '../services/config/manager.js';
import Spinner from '../utils/spinner.js';
import Logger from '../utils/logger.js';

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

const command = new Command('trigger');

command
  .description('Simulate webhook events locally')
  .option('-e, --event <event>', 'Webhook event type to trigger')
  .option('-u, --url <url>', 'Webhook URL to send to (defaults to config)')
  .option('-j, --json', 'Output event data as JSON')
  .action(async (options) => {
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
        'qrph.expired'
      ];

      let selectedEvent = options.event;
      let webhookUrl = options.url || (config?.webhooks?.url);

      // Interactive mode if no event specified
      if (!selectedEvent) {
        spinner.stop();

        const eventChoice = await select({
          message: 'Select webhook event to trigger:',
          choices: availableEvents.map(event => ({
            name: event,
            value: event
          }))
        });

        const urlInput = await input({
          message: 'Webhook URL:',
          default: webhookUrl,
          validate: (value) => {
            try {
              new URL(value);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          }
        });

        selectedEvent = eventChoice;
        webhookUrl = urlInput;
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

      // Simulate sending to webhook URL
      spinner.start('Sending webhook...');

      try {
        const axios = (await import('axios')).default;
        const response = await axios.post(webhookUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PayMongo-CLI/1.0.0'
          },
          timeout: 10000,
          validateStatus: () => true // Don't throw on any status code
        });

        // Validate HTTP response status
        if (response.status >= 200 && response.status < 300) {
          spinner.succeed(`Webhook delivered successfully (HTTP ${response.status})`);
          
          if (response.data) {
            console.log(chalk.gray('\nResponse:'));
            console.log(chalk.gray('─'.repeat(30)));
            console.log(JSON.stringify(response.data, null, 2));
          }
        } else if (response.status === 404) {
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
        } else if (response.status >= 400 && response.status < 500) {
          spinner.fail(`Webhook rejected by server (HTTP ${response.status})`);
          console.log('');
          console.log(chalk.red(`❌ Server returned client error: ${response.status} ${response.statusText || ''}`));
          if (response.data) {
            console.log(chalk.gray('\nServer response:'));
            console.log(JSON.stringify(response.data, null, 2));
          }
          console.log('');
          console.log(chalk.yellow('💡 Common causes:'));
          console.log(chalk.gray('  • Invalid request format or headers'));
          console.log(chalk.gray('  • Authentication/authorization failure'));
          console.log(chalk.gray('  • Webhook signature verification failed'));
          process.exit(1);
        } else if (response.status >= 500) {
          spinner.fail(`Webhook endpoint error (HTTP ${response.status})`);
          console.log('');
          console.log(chalk.red(`❌ Server returned error: ${response.status} ${response.statusText || ''}`));
          if (response.data) {
            console.log(chalk.gray('\nServer response:'));
            console.log(JSON.stringify(response.data, null, 2));
          }
          console.log('');
          console.log(chalk.yellow('💡 This is a server-side error. Check:'));
          console.log(chalk.gray('  • Server logs for the specific error'));
          console.log(chalk.gray('  • Webhook handler code for exceptions'));
          process.exit(1);
        }

      } catch (error) {
        const err = error as Error & { code?: string; response?: { status: number; data?: unknown } };
        
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
  });

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
        data: {}
      }
    }
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
              updated_at: Math.floor(Date.now() / 1000)
            }
          }
        }
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
              updated_at: Math.floor(Date.now() / 1000)
            }
          }
        }
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
              state: 'Metro Manila'
            },
            email: 'test@example.com',
            name: 'Test User',
            phone: '+639123456789'
          },
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000)
        }
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
          updated_at: Math.floor(Date.now() / 1000)
        }
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
          updated_at: Math.floor(Date.now() / 1000)
        }
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
          updated_at: Math.floor(Date.now() / 1000)
        }
      };
  }

  return basePayload;
}

/**
 * Generate a random ID-like string
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

export default command;