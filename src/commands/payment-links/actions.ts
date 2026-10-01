import chalk from 'chalk';
import Table from 'cli-table3';
import type { PaymentLinkData } from '../../types/paymongo.js';
import { PaymentLinkCreateSchema } from '../../types/schemas.js';
import { ValidationError } from '../../utils/errors.js';
import { redactPaymentResource } from '../../utils/payment-resource.js';
import {
  createApiClient,
  createPaymentLinksContext,
  handlePaymentLinksError,
  loadPaymentLinksConfig,
} from './helpers.js';

export async function createAction(options: {
  amount?: string;
  description?: string;
  currency?: string;
  remarks?: string;
  json?: boolean;
}) {
  const { spinner, configManager } = createPaymentLinksContext();

  try {
    const config = await loadPaymentLinksConfig(spinner, configManager);
    if (!config) return;

    const result = PaymentLinkCreateSchema.safeParse({
      amount: Number(options.amount ?? '10000'),
      description: options.description,
      currency: options.currency ?? 'PHP',
      remarks: options.remarks,
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }

    spinner.start('Creating payment link...');
    const paymentLink = await createApiClient(config).createPaymentLink(
      result.data.amount,
      result.data.description,
      result.data.currency,
      result.data.remarks
    );
    spinner.succeed('Payment link created');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(paymentLink), null, 2));
      return;
    }

    printPaymentLink(paymentLink, 'Payment Link Created');
    console.log(chalk.gray('Share this URL with your customer to collect payment.'));
  } catch (error) {
    handlePaymentLinksError('❌ Failed to create payment link:', spinner, error);
  }
}

export async function showAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createPaymentLinksContext();

  try {
    const config = await loadPaymentLinksConfig(spinner, configManager);
    if (!config) return;

    spinner.start('Fetching payment link details...');
    const paymentLink = await createApiClient(config).getPaymentLink(id);
    spinner.succeed('Payment link details loaded');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(paymentLink), null, 2));
      return;
    }

    printPaymentLink(paymentLink, 'Payment Link Details');
    console.log(`${chalk.bold('Created:')} ${new Date(paymentLink.created_at).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(paymentLink.updated_at).toLocaleString()}`);
  } catch (error) {
    handlePaymentLinksError('❌ Failed to fetch payment link:', spinner, error);
  }
}

export async function listAction(options: { limit?: string; json?: boolean }) {
  const { spinner, configManager } = createPaymentLinksContext();

  try {
    const config = await loadPaymentLinksConfig(spinner, configManager);
    if (!config) return;

    const limit = Number(options.limit ?? '10');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be an integer between 1 and 100', 'limit');
    }

    spinner.start('Fetching payment links...');
    const paymentLinks = await createApiClient(config).listPaymentLinks(limit);
    spinner.succeed(`Found ${paymentLinks.length} payment links`);

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(paymentLinks), null, 2));
      return;
    }

    if (paymentLinks.length === 0) {
      console.log(chalk.gray('No payment links found.'));
      return;
    }

    const table = new Table({
      head: ['ID', 'Amount', 'Status', 'Created', 'Description'].map((heading) =>
        chalk.bold(heading)
      ),
      colWidths: [25, 12, 12, 16, 30],
      style: { head: [], border: [] },
    });

    for (const link of paymentLinks) {
      table.push([
        chalk.cyan(link.id.substring(0, 20)),
        chalk.yellow(`${(link.amount / 100).toFixed(2)} ${link.currency}`),
        getStatusColor(link.status)(link.status),
        chalk.gray(new Date(link.created_at).toLocaleDateString()),
        chalk.white((link.description || 'N/A').substring(0, 25)),
      ]);
    }

    console.log(`\n${chalk.bold('Payment Links')}`);
    console.log(table.toString());
  } catch (error) {
    handlePaymentLinksError('❌ Failed to fetch payment links:', spinner, error);
  }
}

function printPaymentLink(link: PaymentLinkData, heading: string): void {
  console.log(`\n${chalk.bold(heading)}`);
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('ID:')} ${link.id}`);
  console.log(`${chalk.bold('Amount:')} ${(link.amount / 100).toFixed(2)} ${link.currency}`);
  console.log(`${chalk.bold('Description:')} ${link.description || 'N/A'}`);
  console.log(`${chalk.bold('Status:')} ${getStatusColor(link.status)(link.status)}`);
  console.log(`${chalk.bold('Reference:')} ${link.reference_number}`);
  console.log(`${chalk.bold('Mode:')} ${link.livemode ? chalk.red('LIVE') : chalk.yellow('TEST')}`);
  if (link.remarks) console.log(`${chalk.bold('Remarks:')} ${link.remarks}`);
  console.log(`${chalk.bold('Checkout URL:')} ${chalk.cyan(link.url)}`);
  console.log(
    chalk.gray('Status describes whether the link accepts payments, not whether it has been paid.')
  );
}

function getStatusColor(status: PaymentLinkData['status']) {
  return status === 'active' ? chalk.green : chalk.yellow;
}
