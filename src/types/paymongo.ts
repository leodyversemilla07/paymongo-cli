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
    livemode?: boolean;
    secret_key?: string;
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
  json?: boolean;
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

export type PaymentIntentCreateOptions = {
  captureType?: 'automatic' | 'manual';
  threeDSecure?: 'any' | 'automatic';
};

// Payment Intent Data
export interface PaymentIntentData {
  id: string;
  type: 'payment_intent';
  attributes: {
    amount: number;
    currency: string;
    status:
      | 'awaiting_payment_method'
      | 'awaiting_next_action'
      | 'awaiting_capture'
      | 'processing'
      | 'succeeded';
    description?: string;
    livemode?: boolean;
    capture_type?: 'automatic' | 'manual';
    next_action?: {
      type: string;
      redirect?: { url: string; return_url?: string };
    } | null;
    last_payment_error?: Record<string, unknown> | null;
    payment_method_allowed: string[];
    created_at: number;
    updated_at: number;
  };
}

// Refund Data
export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'others';

export interface RefundData {
  id: string;
  type: 'refund';
  attributes: {
    amount: number;
    currency: string;
    reason?: RefundReason;
    status: 'pending' | 'processed' | 'failed';
    payment_id: string;
    created_at: number;
    updated_at: number;
  };
}

// Webhook Data with secret (returned on creation)
export interface WebhookDataWithSecret extends WebhookData {
  attributes: WebhookData['attributes'] & {
    secret_key?: string;
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

export type BillingData = {
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type PaymentMethodCreateOptions = {
  bankCode?: string;
  expirySeconds?: number;
};

// Payment Method Data
export interface PaymentMethodData {
  id: string;
  type: 'payment_method';
  attributes: {
    type: string;
    livemode: boolean;
    billing?: BillingData | null;
    expiry_seconds?: number;
    details?: {
      last4?: string;
      exp_month?: number;
      exp_year?: number;
      bank_code?: string;
    } | null;
    created_at: number;
    updated_at: number;
    metadata?: Record<string, unknown>;
  };
}

export type CheckoutLineItem = {
  amount: number;
  currency: string;
  name: string;
  quantity: number;
  description?: string;
  images?: string[];
};

export interface CheckoutSessionData {
  id: string;
  type: 'checkout_session';
  attributes: {
    checkout_url: string;
    livemode: boolean;
    status?: 'active' | 'expired';
    line_items?: CheckoutLineItem[];
    payment_method_types?: string[];
    payment_intent?: PaymentIntentData | null;
    payments?: PaymentDataFull[];
    billing?: BillingData | null;
    description?: string | null;
    reference_number?: string | null;
    success_url?: string | null;
    cancel_url?: string | null;
    created_at: number;
    updated_at: number;
    metadata?: Record<string, unknown>;
  };
}

// Payment Link Data
export interface PaymentLinkData {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  remarks?: string;
  status: 'active' | 'archived';
  livemode: boolean;
  url: string;
  reference_number: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  restrictions?: {
    completed_sessions?: { count?: number; limit?: number };
  };
}
