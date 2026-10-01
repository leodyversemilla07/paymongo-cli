import type {
  CommandOptions,
  PaymentMethodCreateOptions,
  PaymentMethodData,
} from '../../types/paymongo.js';
import {
  PaymentMethodCreateSchema,
  PaymentMethodIdSchema,
  parseApiInput,
} from '../../types/schemas.js';
import { ValidationError } from '../../utils/errors.js';
import { readJsonInput } from '../shared/json-input.js';
import { runResourceCommand } from '../shared/payment-resources.js';

export interface PaymentMethodCreateCommandOptions extends CommandOptions {
  type: string;
  bankCode?: string;
  expirySeconds?: string;
  billingFile?: string;
  metadataFile?: string;
}

function printPaymentMethod(method: PaymentMethodData): void {
  console.log(`Payment Method: ${method.id}`);
  console.log(`Type: ${method.attributes.type}`);
  console.log(`Mode: ${method.attributes.livemode ? 'Live' : 'Test'}`);
  if (method.attributes.details?.bank_code)
    console.log(`Bank: ${method.attributes.details.bank_code}`);
  console.log('Attach this method to a Payment Intent to initiate payment.');
}

export async function createAction(options: PaymentMethodCreateCommandOptions): Promise<void> {
  await runResourceCommand(
    options,
    'Creating payment method...',
    async () => {
      if (options.type === 'card') {
        throw new ValidationError(
          'Raw card creation is not supported by this CLI. Tokenize in your application or use Hosted Checkout.'
        );
      }
      const [billing, metadata] = await Promise.all([
        readJsonInput(options.billingFile),
        readJsonInput(options.metadataFile),
      ]);
      const attributes = parseApiInput(PaymentMethodCreateSchema, {
        type: options.type,
        billing,
        metadata,
        ...(options.bankCode !== undefined && { details: { bank_code: options.bankCode } }),
        ...(options.expirySeconds !== undefined && {
          expiry_seconds: Number(options.expirySeconds),
        }),
      });
      const methodOptions: PaymentMethodCreateOptions = {};
      if (attributes.details) methodOptions.bankCode = attributes.details.bank_code;
      if (attributes.expiry_seconds !== undefined)
        methodOptions.expirySeconds = attributes.expiry_seconds;
      return (client) =>
        client.createPaymentMethod(
          attributes.type,
          attributes.billing,
          attributes.metadata,
          methodOptions
        );
    },
    printPaymentMethod
  );
}

export async function showAction(id: string, options: CommandOptions): Promise<void> {
  await runResourceCommand(
    options,
    'Retrieving payment method...',
    async () => {
      parseApiInput(PaymentMethodIdSchema, id);
      return (client) => client.getPaymentMethod(id);
    },
    printPaymentMethod
  );
}
