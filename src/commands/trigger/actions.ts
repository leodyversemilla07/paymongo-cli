import chalk from 'chalk';
import Table from 'cli-table3';
import { CommandError } from '../../utils/errors.js';
import type { StoredWebhookEvent } from '../../utils/webhook-store.js';
import {
  AVAILABLE_TRIGGER_EVENTS,
  createTriggerContext,
  failTriggerCommand,
  generateWebhookPayload,
  printJsonResponse,
  sendWebhookRequest,
} from './helpers.js';

export async function sendWebhookEvent(options: { event?: string; url?: string; json?: boolean }) {
  const { spinner, configManager, logger, store } = createTriggerContext();

  try {
    const config = await configManager.load();
    let selectedEvent = options.event;
    let webhookUrl = options.url || config?.webhooks?.url;

    if (!selectedEvent) {
      spinner.stop();
      const { select, input } = await import('@inquirer/prompts');

      selectedEvent = await select({
        message: 'Select webhook event to trigger:',
        choices: AVAILABLE_TRIGGER_EVENTS.map((event) => ({
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

      webhookUrl = urlInput || webhookUrl;
    }

    if (!webhookUrl) {
      console.error(
        chalk.red('❌ No webhook URL provided. Use --url option or configure in .paymongo file')
      );
      throw new CommandError();
    }

    if (!selectedEvent) {
      console.error(chalk.red('❌ No event selected'));
      throw new CommandError();
    }

    spinner.start('Generating webhook payload...');
    const webhookPayload = generateWebhookPayload(selectedEvent);

    if (options.json) {
      console.log(JSON.stringify(webhookPayload, null, 2));
      return;
    }

    spinner.succeed('Webhook event generated');

    console.log(chalk.bold.blue('\n🚀 Webhook Event Trigger'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('Event:')} ${chalk.cyan(selectedEvent)}`);
    console.log(`${chalk.bold('URL:')} ${chalk.yellow(webhookUrl)}`);
    console.log(`${chalk.bold('Timestamp:')} ${new Date().toISOString()}`);
    console.log(chalk.gray('\nPayload:'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(JSON.stringify(webhookPayload, null, 2));

    await store.storeEvent({
      id: webhookPayload.data.id,
      event: selectedEvent,
      url: webhookUrl,
      payload: webhookPayload,
      timestamp: Math.floor(Date.now() / 1000),
      status: 'delivered',
    });

    spinner.start('Sending webhook...');

    try {
      const response = await sendWebhookRequest(config, webhookUrl, webhookPayload);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        spinner.succeed(`Webhook delivered successfully (HTTP ${response.statusCode})`);
        const responseData = await printJsonResponse(response);
        if (responseData) {
          console.log(chalk.gray('\nResponse:'));
          console.log(chalk.gray('─'.repeat(30)));
          console.log(JSON.stringify(responseData, null, 2));
        }
        return;
      }

      if (response.statusCode === 404) {
        spinner.fail('Webhook endpoint not found (HTTP 404)');
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
        throw new CommandError();
      }

      if (response.statusCode >= 400 && response.statusCode < 500) {
        spinner.fail(`Webhook rejected by server (HTTP ${response.statusCode})`);
        console.log('');
        console.log(chalk.red(`❌ Server returned client error: ${response.statusCode}`));
        const responseData = await printJsonResponse(response);
        if (responseData) {
          console.log(chalk.gray('\nServer response:'));
          console.log(JSON.stringify(responseData, null, 2));
        }
        console.log('');
        console.log(chalk.yellow('💡 Common causes:'));
        console.log(chalk.gray('  • Invalid request format or headers'));
        console.log(chalk.gray('  • Authentication/authorization failure'));
        console.log(chalk.gray('  • Webhook signature verification failed'));
        throw new CommandError();
      }

      if (response.statusCode >= 500) {
        spinner.fail(`Webhook endpoint error (HTTP ${response.statusCode})`);
        console.log('');
        console.log(chalk.red(`❌ Server returned error: ${response.statusCode}`));
        const responseData = await printJsonResponse(response);
        if (responseData) {
          console.log(chalk.gray('\nServer response:'));
          console.log(JSON.stringify(responseData, null, 2));
        }
        console.log('');
        console.log(chalk.yellow('💡 This is a server-side error. Check:'));
        console.log(chalk.gray('  • Server logs for the specific error'));
        console.log(chalk.gray('  • Webhook handler code for exceptions'));
        throw new CommandError();
      }
    } catch (error) {
      const err = error as Error & { code?: string };

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
        console.log(chalk.gray('  • Verify the server is listening on the correct port'));
        throw new CommandError();
      }

      if (err.code === 'ENOTFOUND') {
        spinner.fail('Host not found');
        console.log('');
        console.log(chalk.red('❌ Could not resolve webhook URL hostname'));
        console.log('');
        console.log(chalk.yellow('💡 Check:'));
        console.log(chalk.gray('  • The URL is spelled correctly'));
        console.log(chalk.gray('  • Your internet connection is working'));
        console.log(chalk.gray('  • DNS is resolving correctly'));
        throw new CommandError();
      }

      if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
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
        throw new CommandError();
      }

      spinner.fail(`Webhook delivery failed: ${err.message}`);
      console.log('');
      console.log(chalk.red('❌ Unexpected error occurred'));
      console.log(chalk.gray(`   Error: ${err.message}`));
      if (err.code) {
        console.log(chalk.gray(`   Code: ${err.code}`));
      }
      throw new CommandError();
    }
  } catch (error) {
    failTriggerCommand(logger, spinner, error);
  }
}

export async function replayWebhookEvent(
  eventId: string | undefined,
  options: {
    event?: string;
    url?: string;
    list?: boolean;
    json?: boolean;
  }
) {
  const { configManager, store } = createTriggerContext();
  const config = await configManager.load();

  try {
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
        table.push([
          chalk.cyan(id),
          chalk.yellow(event.event),
          chalk.gray(new Date(event.timestamp * 1000).toLocaleString()),
        ]);
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

    if (options.event && !eventId) {
      const events = await store.loadEvents();
      const matchingEvents = events.filter(
        (event: StoredWebhookEvent) => event.event === options.event
      );

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
        console.log(
          `${chalk.cyan(`${(index + 1).toString()}.`)} ${chalk.yellow(event.id)} - ${chalk.gray(
            new Date(event.timestamp * 1000).toLocaleString()
          )}`
        );
      });

      console.log(
        chalk.gray('\n💡 Use "paymongo trigger replay <eventId>" to replay a specific event')
      );
      return;
    }

    if (eventId) {
      const event = await store.getEventById(eventId);

      if (!event) {
        console.log(chalk.red(`❌ Event not found: ${eventId}`));
        console.log(chalk.gray('Use "paymongo trigger replay --list" to see available events.'));
        throw new CommandError();
      }

      const webhookUrl = options.url || event.url;

      console.log(chalk.bold.blue('\n🔄 Replaying Webhook Event'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.bold('Event ID:')} ${chalk.cyan(event.id)}`);
      console.log(`${chalk.bold('Event Type:')} ${chalk.yellow(event.event)}`);
      console.log(`${chalk.bold('URL:')} ${chalk.yellow(webhookUrl)}`);
      console.log(
        `${chalk.bold('Original Time:')} ${chalk.gray(new Date(event.timestamp * 1000).toISOString())}`
      );

      const { spinner } = createTriggerContext();
      spinner.start('Sending webhook...');

      try {
        const response = await sendWebhookRequest(config, webhookUrl, event.payload);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          spinner.succeed(`Webhook replayed successfully (HTTP ${response.statusCode})`);
          const responseData = await printJsonResponse(response);
          if (responseData && !options.json) {
            console.log(chalk.gray('\nResponse:'));
            console.log(chalk.gray('─'.repeat(30)));
            console.log(JSON.stringify(responseData, null, 2));
          }
          return;
        }

        spinner.fail(`Webhook replay failed (HTTP ${response.statusCode})`);
        console.log(chalk.red(`Server responded with: ${response.statusCode}`));
        throw new CommandError();
      } catch (error) {
        const err = error as Error & { code?: string };
        spinner.fail('Webhook replay failed');

        if (err.code === 'ECONNREFUSED') {
          console.log(chalk.red('❌ Could not connect to webhook URL'));
        } else {
          console.log(chalk.red(`❌ Error: ${err.message}`));
        }
        throw new CommandError();
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red(`❌ Failed to replay webhook: ${err.message}`));
    throw new CommandError();
  }
}
