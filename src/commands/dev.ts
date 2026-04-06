import { Command } from 'commander';
import { DevServer } from '../services/dev/server.js';
import DevSessionService, { type DevOptions } from '../services/dev/session.js';
import logsCommand from './dev/logs.js';
// Import subcommands
import statusCommand from './dev/status.js';
import stopCommand from './dev/stop.js';
import { createCommandContext, showNoConfigMessage } from './shared/runtime.js';

const command = new Command('dev');

command
  .description('Start local development server')
  .option('-p, --port <port>', 'Port to run the webhook server on', '3000')
  .option('--no-register', 'Skip automatic webhook registration')
  .option(
    '-e, --events <events>',
    'Comma-separated events to listen for',
    'payment.paid,payment.failed'
  )
  .option('--ngrok-token <token>', 'ngrok authtoken (if not set in environment)')
  .option('-d, --detach', 'Run server in background (detached mode)')
  .action(async (options: DevOptions) => {
    const { spinner, configManager } = createCommandContext();
    const session = new DevSessionService({
      spinner,
      configManager,
      onMissingConfig: showNoConfigMessage,
    });
    await session.run(options);
  });

// Register subcommands
command.addCommand(statusCommand);
command.addCommand(stopCommand);
command.addCommand(logsCommand);

export { command, DevServer };
