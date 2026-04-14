#!/usr/bin/env node

import { createRequire } from 'node:module';
import chalk from 'chalk';
import { Command } from 'commander';
import { CommandError } from './utils/errors.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const uncaughtExceptionHandlerKey = Symbol.for('paymongo.cli.uncaughtExceptionHandler');
const unhandledRejectionHandlerKey = Symbol.for('paymongo.cli.unhandledRejectionHandler');
const globalHandlers = globalThis as typeof globalThis & {
  [uncaughtExceptionHandlerKey]?: (error: Error) => void;
  [unhandledRejectionHandlerKey]?: (reason: unknown) => void;
};

const program = new Command();

program
  .name('paymongo')
  .description('CLI tool for PayMongo integration development')
  .version(version)
  .option('--no-rate-limit', 'Disable rate limiting for this command')
  .showHelpAfterError('(add --help for additional information)');

program.hook('preAction', (actionCommand) => {
  const options = (actionCommand as Command).optsWithGlobals();

  if (options.rateLimit === false) {
    process.env.PAYMONGO_DISABLE_RATE_LIMIT = '1';
  } else {
    delete process.env.PAYMONGO_DISABLE_RATE_LIMIT;
  }
});

// Lazy load and register commands
program.addCommand(await import('./commands/init.js').then((m) => m.default));
program.addCommand((await import('./commands/dev.js')).command);
program.addCommand((await import('./commands/login.js')).command);
program.addCommand(await import('./commands/config.js').then((m) => m.default));
program.addCommand(await import('./commands/webhooks.js').then((m) => m.default));
program.addCommand(await import('./commands/payments.js').then((m) => m.default));
program.addCommand(await import('./commands/trigger.js').then((m) => m.default));
program.addCommand(await import('./commands/generate.js').then((m) => m.default));
program.addCommand(await import('./commands/doctor.js').then((m) => m.default));
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
    $ paymongo webhooks disable wh_123                   # Disable a webhook

  Payment Operations:
    $ paymongo payments list                             # List recent payments
    $ paymongo payments show pay_123                     # Show payment details
    $ paymongo payments create-intent --amount 10000     # Create payment intent for ₱100
    $ paymongo payments attach pi_123 --simulate         # Simulate payment method attachment

  Code Generation:
    $ paymongo generate webhook-handler                  # Generate webhook handler boilerplate
    $ paymongo generate payment-intent --language typescript # Generate TypeScript payment intent code
    $ paymongo generate checkout-page --language react   # Generate React checkout component

  Diagnostics:
    $ paymongo doctor                                    # Check config, keys, ngrok, and webhook setup
    $ paymongo doctor --no-network                       # Run offline diagnostics only

  Team Collaboration:
    $ paymongo team rename "My Team"                    # Set or update the team name
    $ paymongo team share-keys --env live               # Share live API keys with the team
    $ paymongo team list-members                        # View team members and shared keys

  Configuration:
    $ paymongo config                                    # View current configuration
    $ paymongo config set environment live               # Set default environment
    $ paymongo config reset                              # Reset to default settings

For more information, visit: https://github.com/leodyversemilla07/paymongo-cli
`
);

if (!globalHandlers[uncaughtExceptionHandlerKey]) {
  globalHandlers[uncaughtExceptionHandlerKey] = (error: Error) => {
    if (error instanceof CommandError) {
      process.exit(1);
    }
    console.error(chalk.red('An unexpected error occurred:'), error.message);
    process.exit(1);
  };
  process.on('uncaughtException', globalHandlers[uncaughtExceptionHandlerKey]);
}

if (!globalHandlers[unhandledRejectionHandlerKey]) {
  globalHandlers[unhandledRejectionHandlerKey] = (reason: unknown) => {
    if (reason instanceof CommandError) {
      process.exit(1);
    }
    console.error(
      chalk.red('An unexpected error occurred:'),
      reason instanceof Error ? reason.message : String(reason)
    );
    process.exit(1);
  };
  process.on('unhandledRejection', globalHandlers[unhandledRejectionHandlerKey]);
}

program.parse();
