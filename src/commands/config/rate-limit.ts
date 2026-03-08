import chalk from 'chalk';
import { CommandError } from '../../utils/errors.js';
import { createConfigContext, ensureRateLimitingConfig, loadRequiredConfig } from './helpers.js';

function parsePositiveInt(value: string, message: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) {
    console.error(chalk.red(message));
    throw new CommandError();
  }
  return parsed;
}

export async function rateLimitEnableAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    ensureRateLimitingConfig(config).enabled = true;

    spinner.start('Enabling rate limiting...');
    await configManager.save(config);
    spinner.succeed('Rate limiting enabled');

    console.log(chalk.green('✓ Rate limiting enabled'));
    console.log(chalk.gray('Default limits: 100 requests/minute (live: 50)'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to enable rate limiting:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitDisableAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    if (config.rateLimiting) {
      config.rateLimiting.enabled = false;
    }

    spinner.start('Disabling rate limiting...');
    await configManager.save(config);
    spinner.succeed('Rate limiting disabled');

    console.log(chalk.green('✓ Rate limiting disabled'));
    console.log(chalk.gray('API calls will no longer be rate limited'));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to disable rate limiting:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitSetMaxRequestsAction(requestsStr: string) {
  const { spinner, configManager } = createConfigContext();

  try {
    const requests = parsePositiveInt(
      requestsStr,
      '❌ Invalid number of requests. Must be a positive integer.'
    );

    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    ensureRateLimitingConfig(config).maxRequests = requests;

    spinner.start('Updating rate limit...');
    await configManager.save(config);
    spinner.succeed('Rate limit updated');

    console.log(chalk.green(`✓ Maximum requests set to ${requests} per minute`));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to update rate limit:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitSetWindowAction(secondsStr: string) {
  const { spinner, configManager } = createConfigContext();

  try {
    const seconds = parsePositiveInt(
      secondsStr,
      '❌ Invalid time window. Must be a positive integer (seconds).'
    );

    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    ensureRateLimitingConfig(config).windowMs = seconds * 1000;

    spinner.start('Updating rate limit window...');
    await configManager.save(config);
    spinner.succeed('Rate limit window updated');

    console.log(chalk.green(`✓ Rate limit window set to ${seconds} seconds`));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to update rate limit window:'), err.message);
    throw new CommandError();
  }
}

export async function rateLimitStatusAction() {
  const { spinner, configManager } = createConfigContext();

  try {
    const config = await loadRequiredConfig(spinner, configManager);
    if (!config) {
      return;
    }

    console.log('\n' + chalk.bold('Rate Limiting Status'));
    console.log('');

    if (!config.rateLimiting || !config.rateLimiting.enabled) {
      console.log(chalk.yellow('Status: Disabled'));
      console.log(chalk.gray('Rate limiting is not currently active'));
      console.log('');
      console.log(chalk.gray("Run 'paymongo config rate-limit enable' to enable"));
      return;
    }

    console.log(chalk.green('Status: Enabled'));
    console.log('');
    console.log(chalk.bold('Global Settings:'));
    console.log(
      `  Max Requests: ${config.rateLimiting.maxRequests} per ${(config.rateLimiting.windowMs || 60000) / 1000}s`
    );
    console.log(
      `  Live Environment Multiplier: ${config.rateLimiting.environmentMultiplier || 0.5}x`
    );

    if (config.rateLimiting.endpoints && Object.keys(config.rateLimiting.endpoints).length > 0) {
      console.log('');
      console.log(chalk.bold('Endpoint Overrides:'));
      Object.entries(config.rateLimiting.endpoints).forEach(([endpoint, limits]) => {
        console.log(`  ${endpoint}: ${limits.maxRequests} per ${limits.windowMs / 1000}s`);
      });
    }

    console.log('');
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray("• 'paymongo config rate-limit disable' - Disable rate limiting"));
    console.log(chalk.gray("• 'paymongo config rate-limit set-max-requests <n>' - Set max requests"));
    console.log(chalk.gray("• 'paymongo config rate-limit set-window <seconds>' - Set time window"));
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    console.error(chalk.red('❌ Failed to check rate limiting status:'), err.message);
    throw new CommandError();
  }
}
