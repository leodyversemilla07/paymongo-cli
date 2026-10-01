import chalk from 'chalk';
import type { Command } from 'commander';
import type { PaymentIntentCreateOptions, PaymentIntentData } from '../../types/paymongo.js';
import {
  PaymentIntentAttachSchema,
  PaymentIntentCaptureSchema,
  PaymentIntentCreateSchema,
  PaymentIntentIdSchema,
} from '../../types/schemas.js';
import { DEFAULT_PAYMENT_INTENT_METHODS, PAYMENT_INTENT_METHODS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';

export type PaymentIntentCommandOptions = {
  amount?: string;
  currency?: string;
  description?: string;
  methods?: string;
  captureType?: string;
  threeDSecure?: string;
  json?: boolean;
};

/** Register the same creation flags for canonical and compatibility commands. */
export function addPaymentIntentCreateOptions(command: Command): Command {
  return command
    .option('-a, --amount <amount>', 'Integer amount in centavos (minimum 100)', '10000')
    .option('-c, --currency <currency>', 'Currency (PHP only)', 'PHP')
    .option('-d, --description <description>', 'Payment description')
    .option(
      '-m, --methods <methods>',
      `Comma-separated method types: ${PAYMENT_INTENT_METHODS.join(', ')}`,
      DEFAULT_PAYMENT_INTENT_METHODS.join(',')
    )
    .option(
      '--capture-type <type>',
      'Capture type: automatic or manual (manual requires card-only methods)',
      'automatic'
    )
    .option('--three-d-secure <mode>', 'Card 3D Secure: any or automatic')
    .option('-j, --json', 'Output as JSON');
}

/** Attachment flags shared by the intents and payments commands. */
export function addPaymentIntentAttachOptions(command: Command): Command {
  return command
    .option('-p, --payment-method <id>', 'Payment method ID to attach (required unless --simulate)')
    .option(
      '-r, --return-url <url>',
      'Return URL (required by PayMongo for redirect-based methods)'
    )
    .option('-j, --json', 'Output as JSON')
    .option(
      '-s, --simulate',
      'Run a local-only simulation (test environment only; does not change PayMongo)'
    )
    .option('-m, --method <method>', 'Simulation method: gcash, maya, grabpay')
    .option('-o, --outcome <outcome>', 'Simulation outcome: success, failure, timeout', 'success')
    .option('-d, --delay <ms>', 'Local simulation delay in milliseconds (integer, minimum 0)');
}

export function addPaymentIntentCaptureOptions(command: Command): Command {
  return command
    .option(
      '-a, --amount <amount>',
      'Optional positive integer amount in centavos (omit for full capture)'
    )
    .option('-j, --json', 'Output as JSON');
}

export function parseCaptureAmount(value?: string): number | undefined {
  const result = PaymentIntentCaptureSchema.safeParse({
    amount: value === undefined ? undefined : Number(value),
  });
  if (!result.success) {
    throw new ValidationError('Capture amount must be a positive integer in centavos', 'amount');
  }
  return result.data.amount;
}

export function validateIntentAttachment(
  id: string,
  paymentMethod: string,
  returnUrl?: string
): void {
  if (!PaymentIntentIdSchema.safeParse(id).success) {
    throw new ValidationError('Invalid payment intent ID', 'id');
  }
  const result = PaymentIntentAttachSchema.safeParse({
    payment_method: paymentMethod,
    return_url: returnUrl,
  });
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
  }
}

/** An attachment can require customer action or authorization, not immediate payment. */
export function printPaymentIntentNextAction(intent: PaymentIntentData): void {
  const attributes = intent.attributes;
  if (attributes.status === 'awaiting_next_action') {
    const redirectUrl = attributes.next_action?.redirect?.url;
    if (redirectUrl)
      console.log(`${chalk.bold('Customer action URL:')} ${chalk.cyan(redirectUrl)}`);
    console.log(
      chalk.yellow(
        'Customer action is required. Confirm the final result via webhook or retrieve the intent.'
      )
    );
  } else if (attributes.status === 'awaiting_capture') {
    console.log(chalk.yellow('Authorized, not charged. Capture before the hold expires:'));
    console.log(chalk.cyan(`  paymongo intents capture ${intent.id}`));
  } else if (attributes.status === 'processing') {
    console.log(
      chalk.yellow(
        'Payment is processing. Wait for payment.paid/payment.failed or retrieve the intent.'
      )
    );
  }
}

/** Validate CLI input before initiating payment operations. */
export function parsePaymentIntentCreation(options: PaymentIntentCommandOptions) {
  const result = PaymentIntentCreateSchema.safeParse({
    amount: Number(options.amount ?? '10000'),
    currency: options.currency ?? 'PHP',
    description: options.description,
    payment_method_allowed: (options.methods ?? DEFAULT_PAYMENT_INTENT_METHODS.join(','))
      .split(',')
      .map((method) => method.trim()),
    capture_type: options.captureType,
    payment_method_options:
      options.threeDSecure === undefined
        ? undefined
        : {
            card: { request_three_d_secure: options.threeDSecure },
          },
  });
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
  }
  const attributes = result.data;
  const apiOptions: PaymentIntentCreateOptions = {
    ...(attributes.capture_type !== undefined && { captureType: attributes.capture_type }),
    ...(attributes.payment_method_options && {
      threeDSecure: attributes.payment_method_options.card.request_three_d_secure,
    }),
  };
  return { attributes, apiOptions };
}
