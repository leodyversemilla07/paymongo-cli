import { PaymentIntentData } from '../../types/paymongo.js';
import { PayMongoError } from '../../utils/errors.js';

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
    const delayMs = options.delayMs || this.defaultDelays[paymentMethod][outcome];

    // Validate inputs
    if (!this.defaultDelays[paymentMethod]) {
      throw new PayMongoError(
        `Unsupported payment method: ${paymentMethod}`,
        'INVALID_PAYMENT_METHOD',
        400
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
    paymentMethod: string,
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
        payment_method_allowed: [paymentMethod],
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

  // Generate realistic webhook events for simulation
  generateWebhookEvents(
    intentId: string,
    paymentMethod: string,
    outcome: string
  ): Array<{
    type: string;
    attributes: Record<string, unknown>;
  }> {
    const events = [];
    const baseTime = Math.floor(Date.now() / 1000);

    // Common events for all payment methods
    if (outcome === 'success') {
      events.push({
        type: 'payment_intent.payment_method.attached',
        attributes: {
          payment_intent_id: intentId,
          payment_method_type: paymentMethod,
          created_at: baseTime - 30,
        },
      });

      events.push({
        type: 'payment_intent.succeeded',
        attributes: {
          payment_intent_id: intentId,
          amount: 100000,
          currency: 'PHP',
          created_at: baseTime,
        },
      });

      // Generate associated payment event
      events.push({
        type: 'payment.paid',
        attributes: {
          amount: 100000,
          currency: 'PHP',
          status: 'paid',
          external_reference_number: `sim_${paymentMethod}_${Date.now()}`,
          fees: 2000, // ₱20.00 fee
          net_amount: 98000,
          paid_at: baseTime,
          created_at: baseTime,
          updated_at: baseTime,
        },
      });
    } else if (outcome === 'failure') {
      events.push({
        type: 'payment_intent.payment_failed',
        attributes: {
          payment_intent_id: intentId,
          failure_code: 'payment_method_declined',
          failure_message: `${paymentMethod.toUpperCase()} payment was declined`,
          created_at: baseTime,
        },
      });
    }

    return events;
  }
}
