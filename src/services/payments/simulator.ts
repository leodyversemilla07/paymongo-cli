import { randomBytes } from 'node:crypto';
import type { PaymentIntentData, WebhookEventPayload } from '../../types/paymongo.js';
import { ValidationError } from '../../utils/errors.js';

const API_METHOD_TYPES = { gcash: 'gcash', maya: 'paymaya', grabpay: 'grab_pay' } as const;

export interface SimulationOptions {
  paymentMethod: 'gcash' | 'maya' | 'grabpay';
  outcome?: 'success' | 'failure' | 'timeout';
  delayMs?: number;
}

export interface SimulationResult {
  paymentIntent: PaymentIntentData;
  delayApplied: number;
  simulationType: string;
}

export class PaymentSimulator {
  private readonly defaultDelays = {
    gcash: { success: 3000, failure: 1500, timeout: 45000 }, // GCash typically fast
    maya: { success: 2000, failure: 1000, timeout: 30000 }, // Maya usually quick
    grabpay: { success: 5000, failure: 2000, timeout: 60000 }, // GrabPay can be slower
  };

  async simulatePaymentConfirmation(
    intentId: string,
    options: SimulationOptions
  ): Promise<SimulationResult> {
    const { paymentMethod, outcome = 'success' } = options;
    // Validate before indexing delays; invalid runtime input must not cause a TypeError.
    this.validateMethodAndOutcome(paymentMethod, outcome);
    const delayMs = options.delayMs ?? this.defaultDelays[paymentMethod][outcome];
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 2147483647) {
      throw new ValidationError(
        'Simulation delay must be an integer between 0 and 2147483647 milliseconds',
        'delayMs'
      );
    }

    // Simulate network delay
    await this.delay(delayMs);

    // Generate mock payment intent result based on outcome
    const paymentIntent = this.generateMockResult(intentId, paymentMethod, outcome);

    return {
      paymentIntent,
      delayApplied: delayMs,
      simulationType: `${paymentMethod}_${outcome}`,
    };
  }

  private generateMockResult(
    intentId: string,
    paymentMethod: SimulationOptions['paymentMethod'],
    outcome: string
  ): PaymentIntentData {
    const baseTime = Math.floor(Date.now() / 1000);

    let status: PaymentIntentData['attributes']['status'];
    let description: string;

    switch (outcome) {
      case 'success':
        status = 'succeeded';
        description = `${paymentMethod.toUpperCase()} payment successful`;
        break;
      case 'failure':
        status = 'awaiting_payment_method'; // Failed payments often stay in this state
        description = `${paymentMethod.toUpperCase()} payment failed`;
        break;
      case 'timeout':
        status = 'awaiting_payment_method'; // Timeouts usually require retry
        description = `${paymentMethod.toUpperCase()} payment timed out`;
        break;
      default:
        status = 'awaiting_payment_method';
        description = `${paymentMethod.toUpperCase()} payment simulation`;
    }

    return {
      id: intentId,
      type: 'payment_intent',
      attributes: {
        amount: 100000, // ₱1000.00
        currency: 'PHP',
        status,
        description,
        livemode: false,
        capture_type: 'automatic',
        payment_method_allowed: [API_METHOD_TYPES[paymentMethod]],
        created_at: baseTime - 60, // 1 minute ago
        updated_at: baseTime,
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getSupportedMethods(): string[] {
    return Object.keys(this.defaultDelays);
  }

  getMethodDelays(method: string): { success: number; failure: number; timeout: number } | null {
    return this.defaultDelays[method as keyof typeof this.defaultDelays] || null;
  }

  private validateMethodAndOutcome(method: string, outcome: string): void {
    if (!Object.hasOwn(API_METHOD_TYPES, method)) {
      throw new ValidationError(`Unsupported simulation method: ${method}`, 'paymentMethod');
    }
    if (!['success', 'failure', 'timeout'].includes(outcome)) {
      throw new ValidationError(`Unsupported simulation outcome: ${outcome}`, 'outcome');
    }
  }

  // Generate synthetic examples with documented event names, not invented intent events.
  generateWebhookEvents(
    intentId: string,
    paymentMethod: SimulationOptions['paymentMethod'],
    outcome: string
  ): WebhookEventPayload[] {
    this.validateMethodAndOutcome(paymentMethod, outcome);
    // A local timeout is not proof of a PayMongo payment failure.
    if (outcome === 'timeout') return [];
    const now = Math.floor(Date.now() / 1000);
    const paid = outcome === 'success';
    return [
      {
        data: {
          id: `evt_${randomBytes(12).toString('hex')}`,
          type: 'event',
          attributes: {
            type: paid ? 'payment.paid' : 'payment.failed',
            livemode: false,
            created_at: now,
            updated_at: now,
            data: {
              id: `pay_${randomBytes(12).toString('hex')}`,
              type: 'payment',
              attributes: {
                amount: 100000,
                currency: 'PHP',
                status: paid ? 'paid' : 'failed',
                livemode: false,
                description: 'Synthetic local simulation — not a PayMongo transaction',
                payment_intent_id: intentId,
                source: {
                  id: `pm_${randomBytes(12).toString('hex')}`,
                  type: API_METHOD_TYPES[paymentMethod],
                },
                created_at: now,
                updated_at: now,
                ...(paid && { paid_at: now }),
              },
            },
          },
        },
      },
    ];
  }
}
