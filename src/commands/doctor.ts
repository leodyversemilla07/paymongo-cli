import chalk from 'chalk';
import { Command } from 'commander';
import { ApiKeyError, CommandError, NetworkError, PayMongoError } from '../utils/errors.js';
import { validateApiKey, validateWebhookUrl } from '../utils/validator.js';
import { createApiClient, createCommandContext } from './shared/runtime.js';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

interface DoctorOptions {
  json?: boolean;
  network?: boolean;
}

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return chalk.green('✓');
    case 'warn':
      return chalk.yellow('⚠');
    case 'fail':
      return chalk.red('✖');
  }
}

function printCheck(check: DoctorCheck): void {
  console.log(`${statusIcon(check.status)} ${chalk.bold(check.name)}: ${check.message}`);
  if (check.fix) {
    console.log(chalk.gray(`  Fix: ${check.fix}`));
  }
}

function hasNgrokToken(): boolean {
  const token = process.env.NGROK_AUTHTOKEN;
  return typeof token === 'string' && token.trim().length > 0;
}

async function runDoctor(options: DoctorOptions): Promise<DoctorCheck[]> {
  const { configManager } = createCommandContext();
  const checks: DoctorCheck[] = [];

  const config = await configManager.load();

  if (!config) {
    checks.push({
      name: 'Configuration',
      status: 'fail',
      message: 'No .paymongo configuration found.',
      fix: 'Run `paymongo init` to create project configuration.',
    });
    return checks;
  }

  checks.push({
    name: 'Configuration',
    status: 'pass',
    message: `Loaded configuration for project "${config.projectName}".`,
  });

  const env = config.environment;
  const envKeys = config.apiKeys[env];

  if (!envKeys?.secret) {
    checks.push({
      name: 'Secret API Key',
      status: 'fail',
      message: `No secret key configured for ${env} environment.`,
      fix: `Run \`paymongo config set apiKeys.${env}.secret YOUR_SECRET_KEY\`.`,
    });
  } else if (!validateApiKey(envKeys.secret, 'secret')) {
    checks.push({
      name: 'Secret API Key',
      status: 'fail',
      message: `Secret key format is invalid for ${env} environment.`,
      fix: 'Use a valid PayMongo secret key starting with `sk_test_` or `sk_live_`.',
    });
  } else {
    checks.push({
      name: 'Secret API Key',
      status: 'pass',
      message: `Secret key format looks valid for ${env} environment.`,
    });
  }

  if (!envKeys?.public) {
    checks.push({
      name: 'Public API Key',
      status: 'warn',
      message: `No public key configured for ${env} environment.`,
      fix: `Run \`paymongo config set apiKeys.${env}.public YOUR_PUBLIC_KEY\` if your integration needs it.`,
    });
  } else if (!validateApiKey(envKeys.public, 'public')) {
    checks.push({
      name: 'Public API Key',
      status: 'fail',
      message: `Public key format is invalid for ${env} environment.`,
      fix: 'Use a valid PayMongo public key starting with `pk_test_` or `pk_live_`.',
    });
  } else {
    checks.push({
      name: 'Public API Key',
      status: 'pass',
      message: `Public key format looks valid for ${env} environment.`,
    });
  }

  if (config.webhooks.url) {
    if (validateWebhookUrl(config.webhooks.url)) {
      checks.push({
        name: 'Webhook URL',
        status: 'pass',
        message: `Webhook URL is valid: ${config.webhooks.url}`,
      });
    } else {
      checks.push({
        name: 'Webhook URL',
        status: 'fail',
        message: `Webhook URL is invalid: ${config.webhooks.url}`,
        fix: 'Set a valid HTTPS or localhost webhook URL.',
      });
    }
  }

  if (config.dev.autoRegisterWebhook) {
    if (hasNgrokToken()) {
      checks.push({
        name: 'ngrok Token',
        status: 'pass',
        message: 'NGROK_AUTHTOKEN is configured for `paymongo dev`.',
      });
    } else {
      checks.push({
        name: 'ngrok Token',
        status: 'warn',
        message: '`paymongo dev` auto-registration may fail because NGROK_AUTHTOKEN is not set.',
        fix: 'Set `NGROK_AUTHTOKEN` or use `paymongo dev --ngrok-token YOUR_TOKEN`.',
      });
    }
  }

  const secretCount = Object.keys(config.webhookSecrets || {}).length;
  if (config.dev.verifyWebhookSignatures) {
    if (secretCount > 0) {
      checks.push({
        name: 'Webhook Signatures',
        status: 'pass',
        message: `Signature verification is enabled and ${secretCount} webhook secret(s) are stored.`,
      });
    } else {
      checks.push({
        name: 'Webhook Signatures',
        status: 'warn',
        message: 'Signature verification is enabled, but no webhook secrets are stored yet.',
        fix: 'Create or auto-register a webhook so PayMongo returns and stores a webhook secret.',
      });
    }
  } else {
    checks.push({
      name: 'Webhook Signatures',
      status: 'warn',
      message: 'Signature verification is disabled.',
      fix: 'Enable it with `paymongo config set dev.verifySignatures true` for safer local testing.',
    });
  }

  const registeredCount = config.registeredWebhooks?.length || 0;
  checks.push({
    name: 'Registered Webhooks',
    status: registeredCount > 0 ? 'pass' : 'warn',
    message:
      registeredCount > 0
        ? `${registeredCount} project-managed webhook(s) tracked for cleanup.`
        : 'No project-managed webhooks are currently tracked.',
  });

  if (options.network !== false && envKeys?.secret && validateApiKey(envKeys.secret, 'secret')) {
    const apiClient = createApiClient(config);
    try {
      await apiClient.validateApiKey();
      checks.push({
        name: 'PayMongo API',
        status: 'pass',
        message: `Secret API key authenticated successfully against the ${env} environment.`,
      });
    } catch (error) {
      const err = error as Error;
      let message = err.message;
      let fix: string | undefined;

      if (error instanceof ApiKeyError) {
        message = 'API authentication failed.';
        fix = 'Check your configured secret key in the PayMongo dashboard.';
      } else if (error instanceof NetworkError) {
        message = 'Could not reach the PayMongo API.';
        fix = 'Check your internet connection and firewall settings.';
      } else if (error instanceof PayMongoError && error.statusCode === 429) {
        message = 'PayMongo API rate limit reached during validation.';
        fix = 'Wait briefly, then rerun `paymongo doctor`.';
      }

      const check: DoctorCheck = {
        name: 'PayMongo API',
        status: 'fail',
        message,
      };
      if (fix !== undefined) {
        check.fix = fix;
      }
      checks.push(check);
    }
  } else if (options.network === false) {
    checks.push({
      name: 'PayMongo API',
      status: 'warn',
      message: 'Skipped live API validation because `--no-network` was used.',
    });
  }

  return checks;
}

export async function doctorAction(options: DoctorOptions): Promise<void> {
  try {
    const checks = await runDoctor(options);

    if (options.json) {
      console.log(JSON.stringify({ checks }, null, 2));
      const hasFailure = checks.some((check) => check.status === 'fail');
      if (hasFailure) {
        throw new CommandError();
      }
      return;
    }

    console.log(chalk.bold('\nPayMongo CLI Doctor'));
    console.log(chalk.gray('─'.repeat(50)));
    checks.forEach(printCheck);

    const failed = checks.filter((check) => check.status === 'fail').length;
    const warned = checks.filter((check) => check.status === 'warn').length;

    console.log('');
    console.log(
      `${chalk.bold('Summary:')} ${chalk.red(failed.toString())} failed, ${chalk.yellow(warned.toString())} warning(s)`
    );

    if (failed > 0) {
      throw new CommandError();
    }
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }

    console.error(chalk.red('❌ Failed to run doctor:'), (error as Error).message);
    throw new CommandError();
  }
}

const command = new Command('doctor')
  .description('Run diagnostics for local PayMongo integration setup')
  .option('-j, --json', 'Output checks as JSON')
  .option('--no-network', 'Skip live PayMongo API validation')
  .action(async (options) => doctorAction(options));

export default command;
