import { Command } from 'commander';
import chalk from 'chalk';
import Spinner from '../../utils/spinner.js';
import { DevProcessManager } from '../../services/dev/process-manager.js';

/**
 * Dev stop subcommand - Stop the background dev server
 */
const stopCommand = new Command('stop')
  .description('Stop the background dev server')
  .action(async () => {
    const spinner = new Spinner();
    const state = await DevProcessManager.loadState();

    if (!state) {
      console.log(chalk.yellow('No dev server is running in background.'));
      return;
    }

    const isRunning = DevProcessManager.isProcessRunning(state.pid);

    if (!isRunning) {
      console.log(chalk.yellow('Dev server process is not running (cleaning up stale state).'));
      await DevProcessManager.clearState();
      return;
    }

    spinner.start('Stopping dev server...');

    // Kill the process
    const killed = DevProcessManager.killProcess(state.pid);

    if (killed) {
      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await DevProcessManager.clearState();
      spinner.succeed('Dev server stopped');

      // Note: The webhook might still be registered if the process didn't clean up properly
      // The next dev start will clean it up
      console.log('');
      console.log(
        chalk.gray(
          'Note: If the webhook was not cleaned up, it will be removed on next "paymongo dev" start.'
        )
      );
    } else {
      spinner.fail('Failed to stop dev server');
      console.log(chalk.yellow('Try manually killing the process:'));
      console.log(chalk.gray(`  PID: ${state.pid}`));
      if (process.platform === 'win32') {
        console.log(chalk.gray(`  Run: taskkill /pid ${state.pid} /f`));
      } else {
        console.log(chalk.gray(`  Run: kill -9 ${state.pid}`));
      }
    }
  });

export default stopCommand;
