import chalk from 'chalk';
import Table from 'cli-table3';
import type { SimulationOptions } from '../../services/payments/simulator.js';
import type { PaymentDataFull } from '../../types/paymongo.js';
import { RefundCreateSchema } from '../../types/schemas.js';
import { BulkOperations } from '../../utils/bulk.js';
import { ValidationError } from '../../utils/errors.js';
import { redactPaymentResource } from '../../utils/payment-resource.js';
import {
  type PaymentIntentCommandOptions,
  parseCaptureAmount,
  parsePaymentIntentCreation,
  printPaymentIntentNextAction,
  validateIntentAttachment,
} from '../shared/payment-intents.js';
import {
  createApiClient,
  createPaymentSimulator,
  createPaymentsContext,
  getStatusColor,
  handlePaymentsError,
  loadPaymentsConfig,
  parseBoundedInt,
} from './helpers.js';

export async function exportAction(options: { file?: string; limit?: string }) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const limit = parseBoundedInt(
      options.limit,
      '100',
      'Limit must be a number between 1 and 1000',
      (parsed) => parsed >= 1 && parsed <= 1000
    );

    spinner.start(`Fetching up to ${limit} payments...`);
    const payments = await createApiClient(config).listPayments(limit);
    spinner.succeed(`Found ${payments.length} payments`);

    if (payments.length === 0) {
      console.log(chalk.yellow('No payments found to export.'));
      return;
    }

    const filename = options.file
      ? BulkOperations.ensureJsonExtension(options.file)
      : BulkOperations.generateFilename('payments', config.environment);

    spinner.start(`Exporting to ${filename}...`);
    await BulkOperations.exportPayments(payments, filename, config.environment);
    spinner.succeed('Export completed');

    console.log(`\n${chalk.green('✅ Payments exported successfully!')}`);
    console.log('');
    console.log(`${chalk.bold('File:')} ${filename}`);
    console.log(`${chalk.bold('Payments:')} ${payments.length}`);
    console.log(`${chalk.bold('Environment:')} ${config.environment}`);
    console.log(`${chalk.bold('Total size:')} ${payments.length} payments`);
  } catch (error) {
    handlePaymentsError('❌ Failed to export payments:', spinner, error);
  }
}

export async function importAction(filename: string, options: { json?: boolean }) {
  const { spinner } = createPaymentsContext();

  try {
    spinner.start(`Importing payments from ${filename}...`);
    const { payments, metadata } = await BulkOperations.importPayments(filename);
    spinner.succeed(`Loaded ${payments.length} payments from export`);

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource({ payments, metadata }), null, 2));
      return;
    }

    console.log(`\n${chalk.green('✅ Payments imported successfully!')}`);
    console.log('');
    console.log(`${chalk.bold('Source:')} ${filename}`);
    console.log(`${chalk.bold('Payments:')} ${payments.length}`);
    console.log(`${chalk.bold('Exported from:')} ${metadata.environment} environment`);
    console.log(`${chalk.bold('Export date:')} ${new Date(metadata.exported_at).toLocaleString()}`);

    console.log(`\n${chalk.yellow('⚠️  Important Notes:')}`);
    console.log(chalk.gray('• Payment data imported for reference only'));
    console.log(chalk.gray('• Actual payments cannot be recreated through the API'));
    console.log(chalk.gray('• Use this for data analysis, migration planning, or testing'));

    if (payments.length > 0) {
      console.log(`\n${chalk.bold('Sample Payment IDs:')}`);
      payments.slice(0, 5).forEach((payment: PaymentDataFull, index: number) => {
        const amount = (payment.attributes.amount / 100).toFixed(2);
        console.log(`  ${index + 1}. ${payment.id} - ₱${amount} ${payment.attributes.currency}`);
      });

      if (payments.length > 5) {
        console.log(chalk.gray(`  ... and ${payments.length - 5} more`));
      }
    }
  } catch (error) {
    handlePaymentsError('❌ Failed to import payments:', spinner, error);
  }
}

export async function listAction(options: { limit?: string; json?: boolean }) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching payments...');
    const payments = await createApiClient(config).listPayments(
      parseInt(options.limit || '10', 10)
    );
    spinner.succeed(`Found ${payments.length} payments`);

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(payments), null, 2));
      return;
    }

    if (payments.length === 0) {
      console.log(chalk.gray('No payments found.'));
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

    payments.forEach((payment: PaymentDataFull) => {
      const amount = `₱${(payment.attributes.amount / 100).toFixed(2)}`;
      const status = payment.attributes.status;
      const created = new Date(payment.attributes.created_at * 1000).toLocaleDateString();
      const description = payment.attributes.description || 'N/A';

      table.push([
        chalk.cyan(payment.id.substring(0, 20) + (payment.id.length > 20 ? '...' : '')),
        chalk.yellow(amount),
        getStatusColor(status)(status),
        chalk.gray(created),
        chalk.white(description.length > 25 ? `${description.substring(0, 22)}...` : description),
      ]);
    });

    console.log(`\n${chalk.bold('Recent Payments')}`);
    console.log(chalk.gray('─'.repeat(95)));
    console.log(table.toString());
    console.log(chalk.gray(`Total: ${payments.length} payments`));
    console.log('');
  } catch (error) {
    handlePaymentsError('❌ Failed to fetch payments:', spinner, error);
  }
}

export async function showAction(id: string, options: { json?: boolean }) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    spinner.start('Fetching payment details...');
    const payment = await createApiClient(config).getPayment(id);
    spinner.succeed('Payment details loaded');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(payment), null, 2));
      return;
    }

    const attrs = payment.attributes;
    const amount = (attrs.amount / 100).toFixed(2);
    const fees = attrs.fees ? (attrs.fees / 100).toFixed(2) : '0.00';
    const netAmount = attrs.net_amount ? (attrs.net_amount / 100).toFixed(2) : '0.00';

    console.log(`\n${chalk.bold('Payment Details')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${payment.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${amount} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
    console.log(`${chalk.bold('External Reference:')} ${attrs.external_reference_number || 'N/A'}`);
    console.log(
      `${chalk.bold('Paid At:')} ${attrs.paid_at ? new Date(attrs.paid_at * 1000).toLocaleString() : 'N/A'}`
    );
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);

    if (attrs.fees) {
      console.log(`${chalk.bold('Fees:')} ₱${fees}`);
      console.log(`${chalk.bold('Net Amount:')} ₱${netAmount}`);
    }

    if (attrs.source) {
      console.log(`${chalk.bold('Payment Method:')} ${attrs.source.attributes.type}`);
    }

    console.log(`${chalk.bold('Payment Intent:')} ${attrs.payment_intent_id}`);
    console.log('');
    console.log(
      chalk.gray(`View in dashboard: https://dashboard.paymongo.com/payments/${payment.id}`)
    );
  } catch (error) {
    handlePaymentsError('❌ Failed to fetch payment:', spinner, error);
  }
}

export async function createIntentAction(options: PaymentIntentCommandOptions) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const { attributes, apiOptions } = parsePaymentIntentCreation(options);

    spinner.start('Creating payment intent...');
    const paymentIntent = await createApiClient(config).createPaymentIntent(
      attributes.amount,
      attributes.currency,
      attributes.description,
      attributes.payment_method_allowed,
      apiOptions
    );
    spinner.succeed('Payment intent created');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(paymentIntent), null, 2));
      return;
    }

    const attrs = paymentIntent.attributes;
    console.log(`\n${chalk.bold('Payment Intent Created')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${paymentIntent.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log('');
    console.log(chalk.gray('Use this ID to attach a payment method and confirm the payment.'));
  } catch (error) {
    handlePaymentsError('❌ Failed to create payment intent:', spinner, error);
  }
}

export async function attachAction(
  intentId: string,
  options: {
    paymentMethod?: string;
    returnUrl?: string;
    json?: boolean;
    simulate?: boolean;
    method?: string;
    outcome?: string;
    delay?: string;
  }
) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    if (options.simulate) {
      if (!options.method) {
        throw new Error(
          'Payment method is required for simulation. Use --method <gcash|maya|grabpay>'
        );
      }
    } else if (!options.paymentMethod) {
      throw new Error('Payment method ID is required. Use --payment-method <id>');
    }

    if (options.simulate) {
      if (config.environment !== 'test') {
        throw new ValidationError(
          'Local payment simulation is only available in the test environment'
        );
      }
      const validMethods = ['gcash', 'maya', 'grabpay'];
      const validOutcomes = ['success', 'failure', 'timeout'];

      if (!options.method || !validMethods.includes(options.method)) {
        throw new Error(
          `Invalid or missing payment method for simulation. Must be one of: ${validMethods.join(', ')}`
        );
      }

      if (!validOutcomes.includes(options.outcome || 'success')) {
        throw new Error(`Invalid simulation outcome. Must be one of: ${validOutcomes.join(', ')}`);
      }

      const delayMs = options.delay === undefined ? undefined : Number(options.delay);
      if (
        delayMs !== undefined &&
        (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 2147483647)
      ) {
        throw new ValidationError(
          'Simulation delay must be an integer between 0 and 2147483647 milliseconds'
        );
      }

      if (!options.json) console.log(`\n${chalk.bold('🧪 Payment Simulation Mode')}`);
      if (!options.json) {
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('Method:')} ${options.method.toUpperCase()}`);
        console.log(`${chalk.bold('Outcome:')} ${options.outcome ?? 'success'}`);
        console.log(
          `${chalk.bold('Delay:')} ${delayMs !== undefined ? `${delayMs}ms` : 'Default for method/outcome'}`
        );
      }

      spinner.start(`Simulating ${options.method} payment...`);
      const simulationOptions: SimulationOptions = {
        paymentMethod: options.method as 'gcash' | 'maya' | 'grabpay',
        outcome: (options.outcome || 'success') as 'success' | 'failure' | 'timeout',
        ...(delayMs !== undefined && { delayMs }),
      };
      const result = await createPaymentSimulator().simulatePaymentConfirmation(
        intentId,
        simulationOptions
      );
      spinner.succeed(`Simulation completed (${result.delayApplied}ms)`);

      if (options.json) {
        console.log(JSON.stringify(redactPaymentResource({ simulated: true, ...result }), null, 2));
        return;
      }

      const attrs = result.paymentIntent.attributes;
      console.log(`\n${chalk.bold('Payment Intent Confirmed (Simulated)')}`);
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.bold('ID:')} ${result.paymentIntent.id}`);
      console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
      console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
      console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
      console.log(
        `${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`
      );
      console.log(
        `${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`
      );
      console.log('');
      console.log(chalk.yellow('⚠️ This was a simulation - no real payment was processed'));
      console.log(
        chalk.gray(`Simulation type: ${result.simulationType} (${result.delayApplied}ms delay)`)
      );
      return;
    }

    validateIntentAttachment(intentId, options.paymentMethod ?? '', options.returnUrl);
    spinner.start('Attaching payment method to payment intent...');
    const result = await createApiClient(config).attachPaymentIntent(
      intentId,
      options.paymentMethod ?? '',
      options.returnUrl
    );
    spinner.succeed('Payment method attached');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(result), null, 2));
      return;
    }

    const attrs = result.attributes;
    console.log(`\n${chalk.bold('Payment Method Attached')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${result.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);
    console.log('');
    printPaymentIntentNextAction(result);
    console.log(chalk.gray(`Check status with: paymongo intents show ${result.id}`));
  } catch (error) {
    handlePaymentsError('❌ Failed to attach payment method:', spinner, error);
  }
}

export const confirmAction = attachAction;

export async function captureAction(
  intentId: string,
  options: { amount?: string; json?: boolean }
) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const amount = parseCaptureAmount(options.amount);
    spinner.start('Capturing payment intent...');
    const result = await createApiClient(config).capturePaymentIntent(intentId, amount);
    spinner.succeed('Payment intent captured');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(result), null, 2));
      return;
    }

    const attrs = result.attributes;
    console.log(`\n${chalk.bold('Payment Intent Captured')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${result.id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Description:')} ${attrs.description || 'N/A'}`);
    console.log(`${chalk.bold('Updated:')} ${new Date(attrs.updated_at * 1000).toLocaleString()}`);
    console.log('');
    if (attrs.status === 'succeeded') {
      console.log(chalk.green('✅ Payment capture succeeded'));
    }
    printPaymentIntentNextAction(result);
  } catch (error) {
    handlePaymentsError('❌ Failed to capture payment intent:', spinner, error);
  }
}

export async function refundAction(
  paymentId: string,
  options: { amount?: string; reason?: string; json?: boolean }
) {
  const { spinner, configManager } = createPaymentsContext();

  try {
    const config = await loadPaymentsConfig(spinner, configManager);
    if (!config) {
      return;
    }

    const result = RefundCreateSchema.safeParse({
      payment_id: paymentId,
      amount: options.amount === undefined ? undefined : Number(options.amount),
      reason: options.reason,
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
    }

    spinner.start('Creating refund...');
    const refund = await createApiClient(config).createRefund(
      result.data.payment_id,
      result.data.amount,
      result.data.reason
    );
    spinner.succeed('Refund created');

    if (options.json) {
      console.log(JSON.stringify(redactPaymentResource(refund), null, 2));
      return;
    }

    const attrs = refund.attributes;
    console.log(`\n${chalk.bold('Refund Created')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('ID:')} ${refund.id}`);
    console.log(`${chalk.bold('Payment ID:')} ${attrs.payment_id}`);
    console.log(`${chalk.bold('Amount:')} ₱${(attrs.amount / 100).toFixed(2)} ${attrs.currency}`);
    console.log(`${chalk.bold('Status:')} ${getStatusColor(attrs.status)(attrs.status)}`);
    console.log(`${chalk.bold('Reason:')} ${attrs.reason || 'N/A'}`);
    console.log(`${chalk.bold('Created:')} ${new Date(attrs.created_at * 1000).toLocaleString()}`);
    console.log('');
    console.log(chalk.yellow('⚠️ Refund processing may take a few minutes'));
    console.log(chalk.gray(`Check status: paymongo payments show-refund ${refund.id}`));
  } catch (error) {
    handlePaymentsError('❌ Failed to create refund:', spinner, error);
  }
}
