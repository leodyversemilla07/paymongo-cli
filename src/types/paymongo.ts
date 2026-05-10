// PayMongo API Types
export interface PayMongoConfig {
  version: string;
  projectName: string;
  environment: 'test' | 'live';
  apiKeys: {
    test?: {
      public: string;
      secret: string;
    };
    live?: {
      public: string;
      secret: string;
    };
  };
  webhooks: {
    url: string;
    events: string[];
  };
  webhookSecrets: Record<string, string>; // webhook_id -> secret
  // Track webhooks registered by this project for cleanup
  registeredWebhooks?: {
    id: string;
    url: string;
    createdAt: number;
  }[];
  dev: {
    port: number;
    autoRegisterWebhook: boolean;
    verifyWebhookSignatures: boolean;
  };
  rateLimiting?: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
    environmentMultiplier?: number;
    endpoints?: Record<string, { maxRequests: number; windowMs: number }>;
  };
  team?: {
    name?: string;
    members?: {
      name: string;
      email?: string;
      addedAt: number;
      sharedKeys?: string[]; // Environment keys that were shared
    }[];
    sharedKeyBundles?: {
      id: string;
      createdAt: number;
      environments: ('test' | 'live')[];
      sharedWith: string[]; // Member names who received this bundle
    }[];
  };
  analytics?: {
    enabled: boolean; // Opt-in analytics for webhook event tracking
  };
}

export interface WebhookData {
  id: string;
  type: 'webhook';
  attributes: {
    url: string;
    events: string[];
    status: 'enabled' | 'disabled';
    created_at: number;
    updated_at: number;
  };
}

export interface PaymentData {
  id: string;
  type: 'payment';
  attributes: {
    amount: number;
    currency: string;
    status: 'paid' | 'failed' | 'pending';
    created_at: number;
    updated_at: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    count?: number;
    pagination?: {
      current_page: number;
      per_page: number;
      total_count: number;
      total_pages: number;
    };
  };
}

// Webhook Event Types
export interface WebhookEvent {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

export interface PaymentEvent extends WebhookEvent {
  type: 'payment';
  attributes: {
    amount: number;
    currency: string;
    status: 'paid' | 'failed' | 'pending' | 'expired';
    created_at: number;
    updated_at: number;
    fees: number;
    net_amount: number;
  };
  relationships: {
    payment_intent?: {
      data: {
        id: string;
        type: 'payment_intent';
      };
    };
  };
}

// Command Types
export interface CommandOptions {
  help?: boolean;
  version?: boolean;
}

// Config Types
export interface ConfigManagerOptions {
  configPath?: string;
}

// Logger Types
export interface LoggerOptions {
  level?: 'error' | 'warn' | 'info' | 'debug';
  file?: string;
}

// Spinner Types
export interface SpinnerOptions {
  text?: string;
  color?: string;
}

// API Client Types
export interface ApiClientConfig {
  config: PayMongoConfig;
}

// Error Types
export interface PayMongoError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Tunnel Types (for ngrok)
export interface TunnelInfo {
  url(): string | null;
  close(): Promise<void>;
}

// Extended Payment Data with full attributes
export interface PaymentDataFull {
  id: string;
  type: 'payment';
  attributes: {
    amount: number;
    currency: string;
    status: 'paid' | 'failed' | 'pending' | 'expired';
    description?: string;
    external_reference_number?: string;
    fees?: number;
    net_amount?: number;
    paid_at?: number;
    created_at: number;
    updated_at: number;
    source?: {
      attributes: {
        type: string;
      };
    };
    payment_intent_id?: string;
  };
}

// Payment Intent Data
export interface PaymentIntentData {
  id: string;
  type: 'payment_intent';
  attributes: {
    amount: number;
    currency: string;
    status: 'awaiting_payment_method' | 'awaiting_next_action' | 'processing' | 'succeeded';
    description?: string;
    payment_method_allowed: string[];
    created_at: number;
    updated_at: number;
  };
}

// Refund Data
export interface RefundData {
  id: string;
  type: 'refund';
  attributes: {
    amount: number;
    currency: string;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    status: 'pending' | 'processed' | 'failed';
    payment_id: string;
    created_at: number;
    updated_at: number;
  };
}

// Webhook Data with secret (returned on creation)
export interface WebhookDataWithSecret extends WebhookData {
  attributes: WebhookData['attributes'] & {
    secret?: string;
  };
}

// Webhook Event Payload (incoming webhook)
export interface WebhookEventPayload {
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  };
}

// Logger meta types
export type LogMeta = Error | Record<string, unknown> | string | number | boolean;

// Source Data (for one-time payments)
export interface SourceData {
  id: string;
  type: 'source';
  attributes: {
    amount: number;
    currency: string;
    type: string; // e.g., 'gcash', 'paymaya', 'card'
    status: 'awaiting_payment' | 'chargeable' | 'paid' | 'failed' | 'expired';
    description?: string;
    livemode: boolean;
    reference_number?: string;
    created_at: number;
    updated_at: number;
    metadata?: Record<string, unknown>;
    checkout_url?: string;
    bancomer_reference_number?: string;
  };
}

// Payment Method Data
export interface PaymentMethodData {
  id: string;
  type: 'payment_method';
  attributes: {
    type: string; // e.g., 'card', 'gcash', 'paymaya'
    status: 'active' | 'inactive' | 'expired';
    billing: {
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country_code?: string;
      };
      email?: string;
      name?: string;
      phone?: string;
    };
    created_at: number;
    updated_at: number;
    metadata?: Record<string, unknown>;
  };
}

// Payment Link Data
export interface PaymentLinkData {
  id: string;
  type: 'payment_link';
  attributes: {
    data: {
      attributes: {
        amount: number;
        currency: string;
        description?: string;
        remarks?: string;
        status: 'active' | 'inactive' | 'unpaid' | 'paid';
        livemode: boolean;
        checkout_url: string;
        reference_number: string;
        created_at: number;
        updated_at: number;
        metadata?: Record<string, unknown>;
      };
      id: string;
      type: string;
    };
    type: string;
  };
}
