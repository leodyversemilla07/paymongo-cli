import { Command } from 'commander';
import {
  createAction,
  deleteAction,
  disableAction,
  enableAction,
  exportAction,
  importAction,
  listAction,
  showAction,
} from './webhooks/actions.js';

const command = new Command('webhooks')
  .description('Manage PayMongo webhooks')
  .addCommand(
    new Command('export')
      .description('Export webhooks to JSON file')
      .option('-f, --file <file>', 'Output file name')
      .action(async (options) => exportAction(options))
  )
  .addCommand(
    new Command('import')
      .description('Import webhooks from JSON file')
      .argument('<filename>', 'JSON file to import')
      .option('-d, --dry-run', 'Show what would be imported without creating')
      .option('-j, --json', 'Output as JSON')
      .action(async (filename, options) => importAction(filename, options))
  )
  .addCommand(
    new Command('create')
      .description('Create a new webhook')
      .option('-u, --url <url>', 'Webhook URL')
      .option('-e, --events <events>', 'Comma-separated events to listen for')
      .action(async (options) => createAction(options))
  )
  .addCommand(
    new Command('list')
      .description('List all webhooks')
      .option('-j, --json', 'Output as JSON')
      .option('-s, --status <status>', 'Filter by status (enabled/disabled)')
      .option('-e, --events <events>', 'Filter by event type (e.g., payment, source)')
      .action(async (options) => listAction(options))
  )
  .addCommand(
    new Command('disable')
      .alias('delete')
      .description('Disable a webhook')
      .argument('<id>', 'Webhook ID to disable')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(async (id, options) => disableAction(id, options))
  )
  .addCommand(
    new Command('enable')
      .description('Enable a webhook')
      .argument('<id>', 'Webhook ID to enable')
      .action(async (id) => enableAction(id))
  )
  .addCommand(
    new Command('show')
      .description('Show webhook details')
      .argument('<id>', 'Webhook ID to show')
      .action(async (id) => showAction(id))
  );

export {
  exportAction,
  importAction,
  createAction,
  listAction,
  disableAction,
  enableAction,
  deleteAction,
  showAction,
};

export default command;
