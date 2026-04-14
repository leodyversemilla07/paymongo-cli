import { z } from 'zod';
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
