import { Command } from 'commander';
import {
  backupAction,
  importAction,
  resetAction,
  setAction,
  showAction,
} from './config/actions.js';
import {
  rateLimitDisableAction,
  rateLimitEnableAction,
  rateLimitSetMaxRequestsAction,
  rateLimitSetWindowAction,
  rateLimitStatusAction,
} from './config/rate-limit.js';

const command = new Command('config');

command
  .description('View and modify configuration')
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .option('-j, --json', 'Output as JSON')
      .action(showAction)
  )
  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .arguments('<key> <value>')
      .action(setAction)
  )
  .addCommand(
    new Command('backup')
      .description('Create a timestamped backup of current configuration')
      .option('-d, --directory <dir>', 'Backup directory (defaults to current directory)')
      .option('-n, --name <name>', 'Custom backup filename prefix')
      .action(backupAction)
  )
  .addCommand(
    new Command('reset').description('Reset configuration to defaults').action(resetAction)
  )
  .addCommand(
    new Command('import')
      .description('Import configuration from file')
      .arguments('<file>')
      .option('-f, --force', 'Overwrite existing configuration without confirmation')
      .action(importAction)
  )
  .addCommand(
    new Command('rate-limit')
      .description('Configure rate limiting settings')
      .addCommand(
        new Command('enable').description('Enable rate limiting').action(rateLimitEnableAction)
      )
      .addCommand(
        new Command('disable').description('Disable rate limiting').action(rateLimitDisableAction)
      )
      .addCommand(
        new Command('set-max-requests')
          .description('Set maximum requests per time window')
          .arguments('<requests>')
          .action(rateLimitSetMaxRequestsAction)
      )
      .addCommand(
        new Command('set-window')
          .description('Set time window in seconds')
          .arguments('<seconds>')
          .action(rateLimitSetWindowAction)
      )
      .addCommand(
        new Command('status')
          .description('Show current rate limiting settings')
          .action(rateLimitStatusAction)
      )
  );

export {
  showAction,
  setAction,
  backupAction,
  resetAction,
  importAction,
  rateLimitEnableAction,
  rateLimitDisableAction,
  rateLimitSetMaxRequestsAction,
  rateLimitSetWindowAction,
  rateLimitStatusAction,
};

export default command;
