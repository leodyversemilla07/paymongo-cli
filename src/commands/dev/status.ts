import chalk from 'chalk';
import { Command } from 'commander';
import { DevProcessManager } from '../../services/dev/process-manager.js';

/**
 * Dev status subcommand - Check if dev server is running in background
 */
const statusCommand = new Command('status')
  .description('Check if dev server is running in background')
  .action(async () => {
    const state = await DevProcessManager.loadState();

    if (!state) {
      console.log(chalk.yellow('No dev server is running in background.'));
      console.log(chalk.gray('Start one with: paymongo dev --detach'));
      return;
    }

    const isRunning = DevProcessManager.isProcessRunning(state.pid);

    if (!isRunning) {
      console.log(chalk.yellow('Dev server process is not running (stale state).'));
      await DevProcessManager.clearState();
      console.log(chalk.gray('Start a new one with: paymongo dev --detach'));
      return;
    }

    console.log(chalk.green('✓ Dev server is running'));
    console.log('');
    console.log(chalk.bold('Process:'));
    console.log(chalk.gray('  PID:'), state.pid);
    console.log(chalk.gray('  Uptime:'), DevProcessManager.formatUptime(state.startedAt));
    console.log(chalk.gray('  Project:'), state.projectName);
    console.log('');
    console.log(chalk.bold('URLs:'));
    console.log(chalk.gray('  External:'), chalk.yellow(state.webhookUrl));
    console.log(chalk.gray('  Local:'), chalk.green(state.localUrl));
    console.log('');
    console.log(chalk.bold('Configuration:'));
    console.log(chalk.gray('  Port:'), state.port);
    console.log(chalk.gray('  Events:'), state.events.join(', '));
    if (state.webhookId) {
      console.log(chalk.gray('  Webhook ID:'), state.webhookId);
    }
    console.log('');
    console.log(chalk.gray('Use "paymongo dev stop" to stop the server'));
    console.log(chalk.gray('Use "paymongo dev logs" to view server logs'));
  });

export default statusCommand;
