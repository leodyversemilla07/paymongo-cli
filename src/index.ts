#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { version } from '../package.json';

// Import commands
import initCommand from './commands/init';
import devCommand from './commands/dev';
import loginCommand from './commands/login';
import configCommand from './commands/config';
import webhooksCommand from './commands/webhooks';
import triggerCommand from './commands/trigger';
import guiCommand from './commands/gui';
import teamCommand from './commands/team';

const program = new Command();

program
  .name('paymongo')
  .description('CLI tool for PayMongo integration development')
  .version(version)
  .showHelpAfterError('(add --help for additional information)');

program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(loginCommand);
program.addCommand(configCommand);
program.addCommand(webhooksCommand);
program.addCommand(triggerCommand);
program.addCommand(guiCommand);
program.addCommand(teamCommand);

// Add global help
program.addHelpText(
  'after',
  `
EXAMPLES
  $ paymongo init
  $ paymongo dev --port 4000
  $ paymongo gui
  $ paymongo webhooks list
  $ paymongo team sync
  $ paymongo trigger payment.paid

For more information, visit: https://github.com/leodyver/paymongo-cli
`
);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(chalk.red('An unexpected error occurred:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

program.parse();

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});
