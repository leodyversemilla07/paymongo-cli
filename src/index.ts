#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { CommandError } from './utils/errors.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('paymongo')
  .description('CLI tool for PayMongo integration development')
  .version(version)
  .option('--no-rate-limit', 'Disable rate limiting for this command')
  .showHelpAfterError('(add --help for additional information)');

// Lazy load and register commands
program.addCommand(await import('./commands/init.js').then((m) => m.default));
program.addCommand((await import('./commands/dev.js')).command);
program.addCommand((await import('./commands/login.js')).command);
program.addCommand(await import('./commands/config.js').then((m) => m.default));
program.addCommand(await import('./commands/webhooks.js').then((m) => m.default));
program.addCommand(await import('./commands/payments.js').then((m) => m.default));
program.addCommand(await import('./commands/trigger.js').then((m) => m.default));
program.addCommand(await import('./commands/generate.js').then((m) => m.default));
program.addCommand(await import('./commands/team/index.js').then((m) => m.default));
program.addCommand(await import('./commands/env.js').then((m) => m.default));

// Add global help
program.addHelpText(
  'after',
  `
EXAMPLES
  Getting Started:
    $ paymongo init                                    # Initialize a new PayMongo project
    $ paymongo login                                    # Authenticate with PayMongo API keys

  Development:
    $ paymongo dev                                       # Start development server with webhook forwarding
    $ paymongo dev --port 4000                          # Use custom port for webhook server
    $ paymongo dev --detach                              # Run server in background
    $ paymongo dev status                                # Check background server status

  Environment Management:
    $ paymongo env current                               # Show current environment (test/live)
    $ paymongo env switch live                           # Switch to live environment
    $ paymongo env switch test --force                   # Switch to test without validation

  Webhook Management:
    $ paymongo webhooks list                             # List all webhooks
    $ paymongo webhooks create                           # Create a new webhook interactively
    $ paymongo webhooks show wh_123                      # Show webhook details
    $ paymongo webhooks delete wh_123                    # Delete a webhook

  Payment Operations:
    $ paymongo payments list                             # List recent payments
    $ paymongo payments show pay_123                     # Show payment details
    $ paymongo payments create-intent --amount 10000     # Create payment intent for ₱100
    $ paymongo payments confirm pi_123 --simulate        # Simulate payment confirmation

  Code Generation:
    $ paymongo generate webhook-handler                  # Generate webhook handler boilerplate
    $ paymongo generate payment-intent --language ts     # Generate TypeScript payment intent code
    $ paymongo generate checkout-page --framework react  # Generate React checkout component

  Team Collaboration:
    $ paymongo team create "My Team"                      # Create a new team
    $ paymongo team share live                           # Share live API keys with team
    $ paymongo team sync                                 # Sync team updates

  Configuration:
    $ paymongo config                                    # View current configuration
    $ paymongo config set environment live               # Set default environment
    $ paymongo config reset                              # Reset to default settings

For more information, visit: https://github.com/leodyversemilla07/paymongo-cli
`
);

// Global error handler
process.on('uncaughtException', (error) => {
  if (error instanceof CommandError) {
    process.exit(1);
  }
  console.error(chalk.red('An unexpected error occurred:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (reason instanceof CommandError) {
    process.exit(1);
  }
  console.error(chalk.red('An unexpected error occurred:'), reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

program.parse();
