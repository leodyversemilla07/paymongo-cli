import { promises as fs } from 'fs';
import path from 'path';
import { WebhookData, PaymentDataFull } from '../types/paymongo.js';
import { PayMongoError } from './errors.js';

export interface BulkExportData {
  metadata: {
    exported_at: string;
    exported_by: string;
    version: string;
    environment: string;
  };
  data: any[];
}

export interface BulkWebhookExport extends BulkExportData {
  data: WebhookData[];
}

export interface BulkPaymentsExport extends BulkExportData {
  data: PaymentDataFull[];
}

export class BulkOperations {
  private static readonly EXPORT_VERSION = '1.0';

  /**
   * Export webhooks to JSON file
   */
  static async exportWebhooks(
    webhooks: WebhookData[],
    filename: string,
    environment: string
  ): Promise<string> {
    const exportData: BulkWebhookExport = {
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: 'paymongo-cli',
        version: this.EXPORT_VERSION,
        environment,
      },
      data: webhooks,
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    await fs.writeFile(filename, jsonContent, 'utf-8');
    return filename;
  }

  /**
   * Export payments to JSON file
   */
  static async exportPayments(
    payments: PaymentDataFull[],
    filename: string,
    environment: string
  ): Promise<string> {
    const exportData: BulkPaymentsExport = {
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: 'paymongo-cli',
        version: this.EXPORT_VERSION,
        environment,
      },
      data: payments,
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    await fs.writeFile(filename, jsonContent, 'utf-8');
    return filename;
  }

  /**
   * Import webhooks from JSON file
   */
  static async importWebhooks(filename: string): Promise<{
    webhooks: WebhookData[];
    metadata: BulkExportData['metadata'];
  }> {
    const content = await fs.readFile(filename, 'utf-8');
    const data = JSON.parse(content);

    this.validateImportData(data, 'webhooks');

    return {
      webhooks: data.data,
      metadata: data.metadata,
    };
  }

  /**
   * Import payments from JSON file
   */
  static async importPayments(filename: string): Promise<{
    payments: PaymentDataFull[];
    metadata: BulkExportData['metadata'];
  }> {
    const content = await fs.readFile(filename, 'utf-8');
    const data = JSON.parse(content);

    this.validateImportData(data, 'payments');

    return {
      payments: data.data,
      metadata: data.metadata,
    };
  }

  /**
   * Validate imported data structure
   */
  private static validateImportData(data: any, type: 'webhooks' | 'payments'): void {
    if (!data || typeof data !== 'object') {
      throw new PayMongoError(
        'Invalid file format - not a valid JSON object',
        'INVALID_FILE_FORMAT',
        400
      );
    }

    if (!data.metadata || !data.data || !Array.isArray(data.data)) {
      throw new PayMongoError(
        'Invalid file format - missing required metadata or data fields',
        'INVALID_FILE_FORMAT',
        400
      );
    }

    if (data.metadata.version !== this.EXPORT_VERSION) {
      throw new PayMongoError(
        `Unsupported export version: ${data.metadata.version}. Current version: ${this.EXPORT_VERSION}`,
        'UNSUPPORTED_VERSION',
        400
      );
    }

    if (data.data.length === 0) {
      throw new PayMongoError('No data found in export file', 'EMPTY_FILE', 400);
    }

    // Type-specific validation
    if (type === 'webhooks') {
      this.validateWebhookData(data.data);
    } else if (type === 'payments') {
      this.validatePaymentData(data.data);
    }
  }

  /**
   * Validate webhook data structure
   */
  private static validateWebhookData(webhooks: any[]): void {
    for (const webhook of webhooks) {
      if (!webhook.id || !webhook.type || !webhook.attributes) {
        throw new PayMongoError(
          'Invalid webhook data structure - missing required fields',
          'INVALID_WEBHOOK_DATA',
          400
        );
      }

      if (webhook.type !== 'webhook') {
        throw new PayMongoError(
          `Invalid webhook type: ${webhook.type}`,
          'INVALID_WEBHOOK_TYPE',
          400
        );
      }

      const attrs = webhook.attributes;
      if (!attrs.url || !attrs.events || !Array.isArray(attrs.events)) {
        throw new PayMongoError(
          'Invalid webhook attributes - missing url or events',
          'INVALID_WEBHOOK_ATTRIBUTES',
          400
        );
      }
    }
  }

  /**
   * Validate payment data structure
   */
  private static validatePaymentData(payments: any[]): void {
    for (const payment of payments) {
      if (!payment.id || !payment.type || !payment.attributes) {
        throw new PayMongoError(
          'Invalid payment data structure - missing required fields',
          'INVALID_PAYMENT_DATA',
          400
        );
      }

      if (payment.type !== 'payment') {
        throw new PayMongoError(
          `Invalid payment type: ${payment.type}`,
          'INVALID_PAYMENT_TYPE',
          400
        );
      }

      const attrs = payment.attributes;
      if (typeof attrs.amount !== 'number' || !attrs.currency) {
        throw new PayMongoError(
          'Invalid payment attributes - missing amount or currency',
          'INVALID_PAYMENT_ATTRIBUTES',
          400
        );
      }
    }
  }

  /**
   * Generate default filename with timestamp
   */
  static generateFilename(type: 'webhooks' | 'payments', environment: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    return `${type}_${environment}_${timestamp}.json`;
  }

  /**
   * Ensure file has .json extension
   */
  static ensureJsonExtension(filename: string): string {
    if (path.extname(filename).toLowerCase() === '.json') {
      return filename;
    }
    return filename + '.json';
  }
}
