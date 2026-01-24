#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Import commands
import initCommand from './commands/init.js';
import devCommand from './commands/dev.js';
import loginCommand from './commands/login.js';
import configCommand from './commands/config.js';
import webhooksCommand from './commands/webhooks.js';
import triggerCommand from './commands/trigger.js';
import guiCommand from './commands/gui.js';
import teamCommand from './commands/team/index.js';
import paymentsCommand from './commands/payments.js';

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
program.addCommand(paymentsCommand);
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
  $ paymongo payments list
  $ paymongo team sync

For more information, visit: https://github.com/leodyversemilla07/paymongo-cli
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
