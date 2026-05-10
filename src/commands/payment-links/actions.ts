import chalk from 'chalk';
import Table from 'cli-table3';
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
    if (!config) {
      return;
    }

    const amount = parseInt(options.amount || '10000', 10);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number in centavos');
    }

    if (!options.description) {
      throw new Error('Description is required for payment links');
    }

    spinner.start('Creating payment link...');
    const paymentLink = await createApiClient(config).createPaymentLink(
      amount,
      options.description,
      options.currency || 'PHP',
      options.remarks
    );
    spinner.succeed('Payment link created');

    if (options.json) {
      console.log(JSON.stringify(paymentLink, null, 2));
      return;
    }

    // Payment Link response structure differs, handle both possible formats
    const linkData = paymentLink.attributes?.data || paymentLink;
    const attrs = linkData.attributes || linkData;

    console.log(`\n${chalk.bold('Payment Link Created')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${linkData.id || paymentLink.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Reference:')} ${attrs.reference_number}`);
    console.log('');
    console.log(`${chalk.bold('Checkout URL:')}`);
    console.log(`  ${chalk.cyan(attrs.checkout_url)}`);
    console.log('');
    console.log(chalk.gray('Share this URL with your customer to collect payment.'));
    console.log(chalk.gray('Use this link to redirect customers or embed in emails.'));
  } catch (error) {
    handlePaymentLinksError('❌ Failed to create payment link:', spinner, error);
  }
}

export async function showAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createPaymentLinksContext();

  try {
    const config = await loadPaymentLinksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching payment link details...');
    const paymentLink = await createApiClient(config).getPaymentLink(id);
    spinner.succeed('Payment link details loaded');

    if (options.json) {
      console.log(JSON.stringify(paymentLink, null, 2));
      return;
    }

    const linkData = paymentLink.attributes?.data || paymentLink;
    const attrs = linkData.attributes || linkData;

    console.log(`\n${chalk.bold('Payment Link Details')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${linkData.id || id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Reference:')} ${attrs.reference_number}`);
    console.log(
      `${chalk.bold('Mode:')} ${attrs.livemode ? chalk.red('LIVE') : chalk.yellow('TEST')}`
    );

    if (attrs.remarks) {
      console.log(`${chalk.bold('Remarks:')} ${attrs.remarks}`);
    }

    console.log('');
    console.log(`${chalk.bold('Checkout URL:')}`);
    console.log(`  ${chalk.cyan(attrs.checkout_url)}`);
    console.log('');
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);
    console.log('');
    console.log(
      chalk.gray(`View in dashboard: https://dashboard.paymongo.com/payment_links/${id}`)
    );
  } catch (error) {
    handlePaymentLinksError('❌ Failed to fetch payment link:', spinner, error);
  }
}

export async function listAction(options: { limit?: string; json?: boolean }) {
  const { spinner, configManager } = createPaymentLinksContext();

  try {
    const config = await loadPaymentLinksConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const limit = parseInt(options.limit || '10', 10);

    spinner.start('Fetching payment links...');
    const paymentLinks = await createApiClient(config).listPaymentLinks(limit);
    spinner.succeed(`Found ${paymentLinks.length} payment links`);

    if (options.json) {
      console.log(JSON.stringify(paymentLinks, null, 2));
      return;
    }

    if (paymentLinks.length === 0) {
      console.log(chalk.gray('No payment links found.'));
      return;
    }

    const table = new Table({
      head: [
        chalk.bold('ID'),
        chalk.bold('Amount'),
        chalk.bold('Status'),
        chalk.bold('Created'),
        chalk.bold('Description'),
      ],
      colWidths: [25, 12, 12, 12, 30],
      style: {
        head: [],
        border: [],
      },
    });

    for (const link of paymentLinks) {
      const linkData = link.attributes?.data || link;
      const attrs = linkData.attributes || link;

      const amount = `₱${(attrs.amount / 100).toFixed(2)}`;
      const created = new Date(attrs.created_at * 1000).toLocaleDateString();
      const description = attrs.description || 'N/A';

      table.push([
        chalk.cyan(linkData.id?.substring(0, 20) || 'N/A'),
        chalk.yellow(amount),
        getStatusColor(attrs.status)(attrs.status),
        chalk.gray(created),
        chalk.white(description.substring(0, 25)),
      ]);
    }

    console.log(`\n${chalk.bold('Payment Links')}`);
    console.log(chalk.gray('─'.repeat(95)));
    console.log(table.toString());
    console.log('');
  } catch (error) {
    handlePaymentLinksError('❌ Failed to fetch payment links:', spinner, error);
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'paid':
    case 'active':
      return chalk.green;
    case 'unpaid':
    case 'inactive':
      return chalk.yellow;
    default:
      return chalk.white;
  }
}
