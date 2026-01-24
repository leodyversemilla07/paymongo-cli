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
  dev: {
    port: number;
    autoRegisterWebhook: boolean;
    verifyWebhookSignatures: boolean;
  };
  team?: {
    githubToken?: string;
    repo?: string;
    branch?: string;
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
