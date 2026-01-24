import { z } from 'zod';

// API Keys schema
const ApiKeysSchema = z.object({
  public: z.string().min(1, 'Public key is required'),
  secret: z.string().min(1, 'Secret key is required'),
});

// Webhooks config schema
const WebhooksConfigSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z.array(z.string()).min(1, 'At least one event is required'),
});

// Dev config schema
const DevConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  autoRegisterWebhook: z.boolean(),
  verifyWebhookSignatures: z.boolean(),
});

// Team config schema (optional)
const TeamConfigSchema = z.object({
  githubToken: z.string().optional(),
  repo: z.string().optional(),
  branch: z.string().optional(),
}).optional();

// Main PayMongo config schema
export const PayMongoConfigSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  projectName: z.string().min(1, 'Project name is required'),
  environment: z.enum(['test', 'live']),
  apiKeys: z.object({
    test: ApiKeysSchema.optional(),
    live: ApiKeysSchema.optional(),
  }).refine(
    (keys) => keys.test !== undefined || keys.live !== undefined,
    { message: 'At least one environment API keys must be configured' }
  ),
  webhooks: WebhooksConfigSchema,
  webhookSecrets: z.record(z.string(), z.string()),
  dev: DevConfigSchema,
  team: TeamConfigSchema,
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
