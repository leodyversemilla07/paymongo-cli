import UndiciClient, { UndiciClientOptions } from './undici-client.js';
import {
  WebhookData,
  WebhookDataWithSecret,
  PaymentDataFull,
  PaymentIntentData,
  RefundData,
} from '../../types/paymongo.js';

export class ApiClient {
  private client: UndiciClient;

  constructor(options: UndiciClientOptions) {
    this.client = new UndiciClient(options);
  }

  async validateApiKey(): Promise<boolean> {
    return this.client.validateApiKey();
  }

  // Webhook methods
  async createWebhook(url: string, events: string[]): Promise<WebhookDataWithSecret> {
    return this.client.createWebhook(url, events);
  }

  async listWebhooks(): Promise<WebhookData[]> {
    return this.client.listWebhooks();
  }

  async getWebhook(id: string): Promise<WebhookData> {
    return this.client.getWebhook(id);
  }

  async updateWebhook(
    id: string,
    updates: { url?: string; events?: string[]; status?: 'enabled' | 'disabled' }
  ): Promise<WebhookData> {
    return this.client.updateWebhook(id, updates);
  }

  async deleteWebhook(id: string): Promise<void> {
    return this.client.deleteWebhook(id);
  }

  // Payment methods (for validation and testing)
  async getPayment(id: string): Promise<PaymentDataFull> {
    return this.client.getPayment(id);
  }

  async listPayments(limit: number = 10): Promise<PaymentDataFull[]> {
    return this.client.listPayments(limit);
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'PHP',
    description?: string,
    paymentMethods: string[] = ['card', 'gcash', 'paymaya']
  ): Promise<PaymentIntentData> {
    return this.client.createPaymentIntent(amount, currency, description, paymentMethods);
  }

  async confirmPaymentIntent(
    id: string,
    paymentMethodId: string,
    returnUrl?: string
  ): Promise<PaymentIntentData> {
    return this.client.confirmPaymentIntent(id, paymentMethodId, returnUrl);
  }

  async capturePaymentIntent(id: string): Promise<PaymentIntentData> {
    return this.client.capturePaymentIntent(id);
  }

  async createRefund(
    paymentId: string,
    amount?: number,
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  ): Promise<RefundData> {
    return this.client.createRefund(paymentId, amount, reason);
  }
}

export default ApiClient;
