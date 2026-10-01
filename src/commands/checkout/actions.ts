import type { CheckoutSessionData, CommandOptions } from '../../types/paymongo.js';
import {
  CheckoutSessionCreateSchema,
  CheckoutSessionIdSchema,
  parseApiInput,
} from '../../types/schemas.js';
import { ValidationError } from '../../utils/errors.js';
import { readJsonInput } from '../shared/json-input.js';
import { runResourceCommand } from '../shared/payment-resources.js';

export interface CheckoutCreateCommandOptions extends CommandOptions {
  itemsFile?: string;
  amount?: string;
  name?: string;
  quantity?: string;
  currency?: string;
  methods: string;
  description?: string;
  referenceNumber?: string;
  successUrl?: string;
  cancelUrl?: string;
  billingFile?: string;
  metadataFile?: string;
  sendEmailReceipt?: boolean;
  showDescription?: boolean;
  showLineItems?: boolean;
}

export interface CheckoutExpireCommandOptions extends CommandOptions {
  yes?: boolean;
}

function printCheckout(session: CheckoutSessionData): void {
  console.log(`Checkout Session: ${session.id}`);
  console.log(`Mode: ${session.attributes.livemode ? 'Live' : 'Test'}`);
  console.log(`Session status: ${session.attributes.status ?? 'not provided'}`);
  console.log(`Checkout URL: ${session.attributes.checkout_url}`);
  if (session.attributes.payment_intent) {
    console.log(`Payment Intent status: ${session.attributes.payment_intent.attributes.status}`);
  }
  console.log(
    'Session status describes availability, not payment success. Confirm payment using verified webhooks (checkout_session.payment.paid).'
  );
}

export async function createAction(options: CheckoutCreateCommandOptions): Promise<void> {
  await runResourceCommand(
    options,
    'Creating Hosted Checkout Session (v1)...',
    async () => {
      if (
        options.itemsFile &&
        [options.amount, options.name, options.quantity, options.currency].some(
          (value) => value !== undefined
        )
      ) {
        throw new ValidationError('Use --items-file or single-item flags, not both');
      }
      if (!options.itemsFile && (options.amount === undefined || options.name === undefined)) {
        throw new ValidationError('Provide --items-file, or both --amount and --name');
      }
      const [items, billing, metadata] = await Promise.all([
        readJsonInput(options.itemsFile),
        readJsonInput(options.billingFile),
        readJsonInput(options.metadataFile),
      ]);
      const attributes = parseApiInput(CheckoutSessionCreateSchema, {
        line_items: options.itemsFile
          ? items
          : [
              {
                amount: Number(options.amount),
                name: options.name,
                quantity: options.quantity === undefined ? 1 : Number(options.quantity),
                currency: options.currency ?? 'PHP',
              },
            ],
        payment_method_types: options.methods.split(',').map((method) => method.trim()),
        description: options.description,
        reference_number: options.referenceNumber,
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
        send_email_receipt: options.sendEmailReceipt,
        show_description: options.showDescription,
        show_line_items: options.showLineItems,
        billing,
        metadata,
      });
      return (client) => client.createCheckoutSession(attributes);
    },
    printCheckout
  );
}

export async function showAction(id: string, options: CommandOptions): Promise<void> {
  await runResourceCommand(
    options,
    'Retrieving Hosted Checkout Session...',
    async () => {
      parseApiInput(CheckoutSessionIdSchema, id);
      return (client) => client.getCheckoutSession(id);
    },
    printCheckout
  );
}

export async function expireAction(
  id: string,
  options: CheckoutExpireCommandOptions
): Promise<void> {
  await runResourceCommand(
    options,
    'Expiring Hosted Checkout Session...',
    async () => {
      parseApiInput(CheckoutSessionIdSchema, id);
      return (client) => client.expireCheckoutSession(id);
    },
    printCheckout,
    async (config) => {
      if (options.yes) return true;
      const { confirm } = await import('@inquirer/prompts');
      const approved = await confirm({
        message: `Expire ${id} in ${config.environment.toUpperCase()} mode? This disables its checkout URL.`,
        default: false,
      });
      if (!approved) console.log('Expiration cancelled.');
      return approved;
    }
  );
}
