import chalk from 'chalk';
import { Command } from 'commander';
import WebhookEventStore from '../utils/webhook-store.js';
import { replayWebhookEvent, sendWebhookEvent } from './trigger/actions.js';

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

command
  .option('-e, --event <event>', 'Webhook event type to trigger')
  .option('-u, --url <url>', 'Webhook URL to send to (defaults to config)')
  .option('-j, --json', 'Output event data as JSON')
  .action(async (options) => {
    if (Object.keys(options).length > 0) {
      await sendWebhookEvent(options);
    } else {
      command.help();
    }
  });

export { replayWebhookEvent, sendWebhookEvent };

export default command;
