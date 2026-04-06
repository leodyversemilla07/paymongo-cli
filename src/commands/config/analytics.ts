import chalk from 'chalk';
import { CommandError } from '../../utils/errors.js';
import { createConfigContext, ensureAnalyticsConfig, loadRequiredConfig } from './helpers.js';

export async function analyticsEnableAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    ensureAnalyticsConfig(config).enabled = true;

    spinner.start('Enabling analytics...');
    await configManager.save(config);
    spinner.succeed('Analytics enabled');

    console.log(chalk.green('✓ Analytics enabled'));
    console.log(chalk.gray('Webhook events will now be tracked locally on this machine'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to enable analytics:'), err.message);
    throw new CommandError();
  }
}

export async function analyticsDisableAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    ensureAnalyticsConfig(config).enabled = false;

    spinner.start('Disabling analytics...');
    await configManager.save(config);
    spinner.succeed('Analytics disabled');

    console.log(chalk.green('✓ Analytics disabled'));
    console.log(chalk.gray('Existing analytics data remains local until you remove it manually'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to disable analytics:'), err.message);
    throw new CommandError();
  }
}

export async function analyticsStatusAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    console.log(`\n${chalk.bold('Analytics Status')}`);
    console.log('');

    if (!config.analytics?.enabled) {
      console.log(chalk.yellow('Status: Disabled'));
      console.log(chalk.gray('Webhook analytics are currently opt-out for this project'));
      console.log('');
      console.log(chalk.gray("Run 'paymongo config analytics enable' to enable"));
      return;
    }

    console.log(chalk.green('Status: Enabled'));
    console.log(chalk.gray('Webhook analytics are stored locally and never sent externally'));
    console.log('');
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray("• 'paymongo config analytics disable' - Disable analytics"));
    console.log(chalk.gray("• 'paymongo config show' - View current analytics setting"));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to check analytics status:'), err.message);
    throw new CommandError();
  }
}
