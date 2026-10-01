import { z } from 'zod';
import {
  CHECKOUT_PAYMENT_METHOD_TYPES,
  NON_CARD_PAYMENT_METHOD_TYPES,
  PAYMENT_INTENT_METHODS,
} from '../utils/constants.js';
import { ValidationError } from '../utils/errors.js';
import { validateWebhookUrl } from '../utils/validator.js';

// API Keys schema
const ApiKeysSchema = z.object({
  // Public keys are optional in several CLI flows, so allow an empty string here
  // and defer format validation to command-level validators when provided.
  public: z.string(),
  secret: z.string().min(1, 'Secret key is required'),
});

// Webhooks config schema
const WebhooksConfigSchema = z.object({
  url: z.string().refine(validateWebhookUrl, 'Invalid webhook URL. Must be HTTPS or localhost'),
  events: z.array(z.string()).min(1, 'At least one event is required'),
});

// Dev config schema
const DevConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  autoRegisterWebhook: z.boolean(),
  verifyWebhookSignatures: z.boolean(),
});

const RateLimitEndpointSchema = z.object({
  maxRequests: z.number().int().min(1),
  windowMs: z.number().int().min(1),
});

const RateLimitingSchema = z.object({
  enabled: z.boolean(),
  maxRequests: z.number().int().min(1),
  windowMs: z.number().int().min(1),
  environmentMultiplier: z.number().positive().optional(),
  endpoints: z.record(z.string(), RateLimitEndpointSchema).optional(),
});

// Main PayMongo config schema
export const PayMongoConfigSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  projectName: z.string().min(1, 'Project name is required'),
  environment: z.enum(['test', 'live']),
  apiKeys: z
    .object({
      test: ApiKeysSchema.optional(),
      live: ApiKeysSchema.optional(),
    })
    .optional(),
  webhooks: WebhooksConfigSchema,
  webhookSecrets: z.record(z.string(), z.string()).optional(),
  dev: DevConfigSchema,
  rateLimiting: RateLimitingSchema.optional(),
  team: z
    .object({
      name: z.string().optional(),
      members: z
        .array(
          z.object({
            name: z.string(),
            email: z.string().optional(),
            addedAt: z.number(),
            sharedKeys: z.array(z.string()).optional(),
          })
        )
        .optional(),
      sharedKeyBundles: z
        .array(
          z.object({
            id: z.string(),
            createdAt: z.number(),
            environments: z.array(z.enum(['test', 'live'])),
            sharedWith: z.array(z.string()),
          })
        )
        .optional(),
    })
    .optional(),
  registeredWebhooks: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        createdAt: z.number(),
      })
    )
    .optional(),
  analytics: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
});

// Core payment contracts: use endpoint references rather than provider display names.
export const PaymentIntentIdSchema = z
  .string()
  .regex(/^pi_[a-zA-Z0-9]+$/, 'Invalid payment intent ID');
export const PaymentMethodIdSchema = z
  .string()
  .regex(/^pm_[a-zA-Z0-9]+$/, 'Invalid payment method ID');
export const PaymentIntentCreateSchema = z
  .object({
    amount: z
      .number({ error: 'Amount must be an integer of at least 100 centavos' })
      .int({ error: 'Amount must be an integer of at least 100 centavos' })
      .min(100, 'Amount must be an integer of at least 100 centavos'),
    payment_method_allowed: z.array(z.enum(PAYMENT_INTENT_METHODS)).min(1),
    currency: z.literal('PHP', { error: 'Payment Intents only support PHP' }),
    description: z.string().optional(),
    capture_type: z.enum(['automatic', 'manual']).optional(),
    payment_method_options: z
      .object({
        card: z.object({ request_three_d_secure: z.enum(['any', 'automatic']) }),
      })
      .optional(),
  })
  .superRefine((attributes, context) => {
    if (
      attributes.capture_type === 'manual' &&
      attributes.payment_method_allowed.some((method) => method !== 'card')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['payment_method_allowed'],
        message: 'Manual capture requires card-only payment methods',
      });
    }
    if (
      attributes.payment_method_options?.card &&
      !attributes.payment_method_allowed.includes('card')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['payment_method_options'],
        message: '3D Secure options require the card payment method',
      });
    }
  });

export const PaymentIntentAttachSchema = z.object({
  payment_method: PaymentMethodIdSchema,
  return_url: z
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }, 'Return URL must be HTTP(S) without embedded credentials')
    .optional(),
});

export const PaymentIntentCaptureSchema = z.object({
  amount: z.number().int().positive().optional(),
});

export type PaymentIntentCreateAttributes = z.infer<typeof PaymentIntentCreateSchema>;

// Payment Links uses top-level fields, unlike the legacy Links API.
// https://docs.paymongo.com/reference/post_v1-payment-links
export const PaymentLinkCreateSchema = z.object({
  amount: z.number().int().min(100).max(999999999),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be three uppercase letters'),
  description: z.string().max(1000),
  remarks: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

// Refunds require an explicit amount and reason; the API does not default to a full refund.
export const RefundCreateSchema = z.object({
  payment_id: z.string().min(1),
  amount: z.number().int().min(100),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'others']),
});

export const HttpUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'URL must be HTTP(S) without embedded credentials');

const BillingInputSchema = z
  .object({
    address: z
      .object({
        line1: z.string().optional(),
        line2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postal_code: z.string().optional(),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/, 'Country must be a two-letter uppercase code')
          .optional(),
      })
      .strict()
      .optional(),
    name: z.string().optional(),
    email: z.email().optional(),
    phone: z.string().optional(),
  })
  .strict();

export const PaymentMethodCreateSchema = z
  .object({
    type: z.enum(NON_CARD_PAYMENT_METHOD_TYPES),
    billing: BillingInputSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    details: z.object({ bank_code: z.string() }).strict().optional(),
    expiry_seconds: z.number().int().optional(),
  })
  .strict()
  .superRefine((attributes, context) => {
    const bankCode = attributes.details?.bank_code;
    if (attributes.type === 'dob' || attributes.type === 'brankas') {
      const allowed =
        attributes.type === 'dob'
          ? ['bpi', 'ubp', 'test_bank_one', 'test_bank_two']
          : ['bdo', 'metrobank', 'landbank'];
      if (!bankCode || !allowed.includes(bankCode)) {
        context.addIssue({
          code: 'custom',
          path: ['details', 'bank_code'],
          message: `Choose a bank code for ${attributes.type}: ${allowed.join(', ')}`,
        });
      }
    } else if (bankCode !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: 'Bank selection only applies to dob and brankas',
      });
    }
    if (attributes.expiry_seconds !== undefined) {
      const minimum = attributes.type === 'qrph' ? 60 : 1;
      const maximum = attributes.type === 'qrph' ? 9000 : 3600;
      if (!['qrph', 'shopee_pay'].includes(attributes.type)) {
        context.addIssue({
          code: 'custom',
          path: ['expiry_seconds'],
          message: 'Custom expiry only applies to qrph and shopee_pay',
        });
      } else if (attributes.expiry_seconds < minimum || attributes.expiry_seconds > maximum) {
        context.addIssue({
          code: 'custom',
          path: ['expiry_seconds'],
          message: `Expiry must be between ${minimum} and ${maximum} seconds`,
        });
      }
    }
  });

export const CheckoutSessionIdSchema = z
  .string()
  .regex(/^cs_[a-zA-Z0-9]+$/, 'Invalid Checkout Session ID');
export const CheckoutLineItemSchema = z
  .object({
    amount: z.number().int().positive(),
    currency: z.literal('PHP'),
    name: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(1000000000),
    description: z.string().max(255).optional(),
    images: z.array(HttpUrlSchema).max(1).optional(),
  })
  .strict();
export const CheckoutSessionCreateSchema = z
  .object({
    line_items: z.array(CheckoutLineItemSchema).min(1).max(999),
    payment_method_types: z.array(z.enum(CHECKOUT_PAYMENT_METHOD_TYPES)).min(1),
    success_url: HttpUrlSchema.optional(),
    cancel_url: HttpUrlSchema.optional(),
    description: z.string().optional(),
    reference_number: z.string().optional(),
    send_email_receipt: z.boolean().optional(),
    show_description: z.boolean().optional(),
    show_line_items: z.boolean().optional(),
    billing: BillingInputSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .superRefine((attributes, context) => {
    const total = attributes.line_items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    if (!Number.isSafeInteger(total)) {
      context.addIssue({
        code: 'custom',
        path: ['line_items'],
        message: 'Order total exceeds safe integer centavo arithmetic',
      });
    }
  });

export type PaymentMethodCreateInput = z.infer<typeof PaymentMethodCreateSchema>;
export type CheckoutSessionCreateInput = z.infer<typeof CheckoutSessionCreateSchema>;

/** Validate API-bound input without echoing request values in error output. */
export function parseApiInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    );
  }
  return result.data;
}

// Type inference from schema
export type PayMongoConfigFromSchema = z.infer<typeof PayMongoConfigSchema>;

// Validation helper
export function validateConfig(config: unknown): {
  success: boolean;
  data?: PayMongoConfigFromSchema;
  errors?: string[];
} {
  const result = PayMongoConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  return { success: false, errors };
}

// Partial config validation for updates
export const PartialPayMongoConfigSchema = PayMongoConfigSchema.partial();

export type PartialPayMongoConfig = z.infer<typeof PartialPayMongoConfigSchema>;

export function validatePartialConfig(config: unknown): {
  success: boolean;
  data?: PartialPayMongoConfig;
  errors?: string[];
} {
  const result = PartialPayMongoConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  return { success: false, errors };
}
