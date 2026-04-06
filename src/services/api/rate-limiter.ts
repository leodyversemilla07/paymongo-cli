import type { PayMongoConfig } from '../../types/paymongo.js';

export interface RateLimitPolicy {
  /** Maximum requests per time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Environment-specific multiplier (live environment might be stricter) */
  environmentMultiplier?: number;
}

export interface RateLimitConfig {
  /** Default policy for all endpoints */
  default: RateLimitPolicy;
  /** Endpoint-specific policies */
  endpoints: Record<string, RateLimitPolicy>;
  /** Environment-specific overrides */
  environments: {
    test?: Partial<RateLimitPolicy>;
    live?: Partial<RateLimitPolicy>;
  };
}

export class RateLimiter {
  private config: PayMongoConfig;
  private rateLimitConfig: RateLimitConfig;
  private callHistory: Map<string, number[]> = new Map();

  constructor(config: PayMongoConfig, rateLimitConfig: RateLimitConfig) {
    this.config = config;
    this.rateLimitConfig = rateLimitConfig;
  }

  /**
   * Check if a request is allowed under current rate limits
   * @param endpoint - API endpoint being called (e.g., '/webhooks', '/payments')
   * @returns Object indicating if request is allowed and backoff time if not
   */
  checkLimit(endpoint: string): {
    allowed: boolean;
    backoffMs?: number;
    remainingRequests?: number;
  } {
    const policy = this.getEffectivePolicy(endpoint);
    const key = this.getHistoryKey(endpoint);
    const now = Date.now();

    // Get call history for this endpoint
    const calls = this.callHistory.get(key) || [];

    // Remove calls outside the time window
    const validCalls = calls.filter((callTime) => now - callTime < policy.windowMs);

    // Update history
    this.callHistory.set(key, validCalls);

    // Check if we're under the limit
    if (validCalls.length < policy.maxRequests) {
      return {
        allowed: true,
        remainingRequests: policy.maxRequests - validCalls.length - 1,
      };
    }

    // Calculate backoff time based on oldest call in window
    const oldestCall = Math.min(...validCalls);
    const backoffMs = policy.windowMs - (now - oldestCall);

    return {
      allowed: false,
      backoffMs: Math.max(1000, backoffMs), // Minimum 1 second backoff
      remainingRequests: 0,
    };
  }

  /**
   * Record a successful API call
   * @param endpoint - API endpoint that was called
   */
  recordCall(endpoint: string): void {
    const key = this.getHistoryKey(endpoint);
    const now = Date.now();

    const calls = this.callHistory.get(key) || [];
    calls.push(now);

    // Keep only recent calls within a reasonable time frame (10x the longest window)
    const maxWindow = Math.max(
      this.rateLimitConfig.default.windowMs,
      ...Object.values(this.rateLimitConfig.endpoints).map((p) => p.windowMs)
    );
    const cutoffTime = now - maxWindow * 10;

    const recentCalls = calls.filter((callTime) => callTime > cutoffTime);
    this.callHistory.set(key, recentCalls);
  }

  /**
   * Get the effective rate limit policy for an endpoint considering environment
   */
  private getEffectivePolicy(endpoint: string): RateLimitPolicy {
    // Start with default policy
    let policy = { ...this.rateLimitConfig.default };

    // Apply endpoint-specific overrides
    if (this.rateLimitConfig.endpoints[endpoint]) {
      policy = { ...policy, ...this.rateLimitConfig.endpoints[endpoint] };
    }

    // Apply environment-specific multipliers
    const env = this.config.environment;
    const envOverrides = this.rateLimitConfig.environments[env];

    if (envOverrides) {
      policy = { ...policy, ...envOverrides };
    }

    // Apply environment multiplier
    if (policy.environmentMultiplier !== undefined) {
      policy.maxRequests = Math.floor(policy.maxRequests * policy.environmentMultiplier);
    }

    return policy;
  }

  /**
   * Get the key used for tracking call history
   */
  private getHistoryKey(endpoint: string): string {
    return `${this.config.environment}:${endpoint}`;
  }

  /**
   * Get current rate limit status for an endpoint
   */
  getStatus(endpoint: string): {
    policy: RateLimitPolicy;
    currentCalls: number;
    remainingRequests: number;
    nextAvailableInMs?: number;
  } {
    const policy = this.getEffectivePolicy(endpoint);
    const key = this.getHistoryKey(endpoint);
    const now = Date.now();

    const calls = this.callHistory.get(key) || [];
    const validCalls = calls.filter((callTime) => now - callTime < policy.windowMs);

    let nextAvailableInMs: number | undefined;
    if (validCalls.length >= policy.maxRequests) {
      const oldestCall = Math.min(...validCalls);
      nextAvailableInMs = policy.windowMs - (now - oldestCall);
    }

    const result: {
      policy: RateLimitPolicy;
      currentCalls: number;
      remainingRequests: number;
      nextAvailableInMs?: number;
    } = {
      policy,
      currentCalls: validCalls.length,
      remainingRequests: Math.max(0, policy.maxRequests - validCalls.length),
    };

    if (nextAvailableInMs !== undefined) {
      result.nextAvailableInMs = Math.max(1000, nextAvailableInMs);
    }

    return result;
  }

  /**
   * Reset all call history (useful for testing)
   */
  reset(): void {
    this.callHistory.clear();
  }
}

export default RateLimiter;
