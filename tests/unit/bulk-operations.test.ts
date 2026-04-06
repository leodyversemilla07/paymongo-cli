import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PaymentDataFull, WebhookData } from '../../src/types/paymongo.js';
import { BulkOperations } from '../../src/utils/bulk.js';
import { PayMongoError } from '../../src/utils/errors.js';

describe('BulkOperations', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulk-ops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const sampleWebhook: WebhookData = {
    id: 'hook_xxx',
    type: 'webhook',
    attributes: {
      url: 'https://example.com/webhook',
      events: ['payment.paid'],
      status: 'enabled',
      created_at: 1234567890,
      updated_at: 1234567890,
    },
  };

  const samplePayment: PaymentDataFull = {
    id: 'pay_xxx',
    type: 'payment',
    attributes: {
      amount: 10000,
      currency: 'PHP',
      status: 'paid',
      created_at: 1234567890,
      updated_at: 1234567890,
    },
  };

  describe('exportWebhooks', () => {
    it('should write valid JSON with metadata and data', async () => {
      const filepath = path.join(tmpDir, 'webhooks.json');

      const result = await BulkOperations.exportWebhooks([sampleWebhook], filepath, 'test');

      expect(result).toBe(filepath);

      const content = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(content.metadata).toBeDefined();
      expect(content.metadata.exported_by).toBe('paymongo-cli');
      expect(content.metadata.version).toBe('1.0');
      expect(content.metadata.environment).toBe('test');
      expect(content.metadata.exported_at).toBeDefined();
      expect(content.data).toEqual([sampleWebhook]);
    });
  });

  describe('exportPayments', () => {
    it('should write valid JSON with metadata and data', async () => {
      const filepath = path.join(tmpDir, 'payments.json');

      const result = await BulkOperations.exportPayments([samplePayment], filepath, 'live');

      expect(result).toBe(filepath);

      const content = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(content.metadata).toBeDefined();
      expect(content.metadata.exported_by).toBe('paymongo-cli');
      expect(content.metadata.version).toBe('1.0');
      expect(content.metadata.environment).toBe('live');
      expect(content.metadata.exported_at).toBeDefined();
      expect(content.data).toEqual([samplePayment]);
    });
  });

  describe('importWebhooks', () => {
    it('should successfully import valid webhook export', async () => {
      const filepath = path.join(tmpDir, 'webhooks.json');
      await BulkOperations.exportWebhooks([sampleWebhook], filepath, 'test');

      const result = await BulkOperations.importWebhooks(filepath);

      expect(result.webhooks).toEqual([sampleWebhook]);
      expect(result.metadata.exported_by).toBe('paymongo-cli');
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.environment).toBe('test');
    });

    it('should throw PayMongoError with FILE_NOT_FOUND for missing file', async () => {
      const filepath = path.join(tmpDir, 'nonexistent.json');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('should throw PayMongoError with INVALID_JSON for malformed JSON', async () => {
      const filepath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filepath, '{not valid json!!!', 'utf-8');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'INVALID_JSON',
      });
    });

    it('should throw PayMongoError for invalid structure (missing metadata/data)', async () => {
      const filepath = path.join(tmpDir, 'invalid-structure.json');
      await fs.writeFile(filepath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'INVALID_FILE_FORMAT',
      });
    });

    it('should throw PayMongoError for wrong version', async () => {
      const filepath = path.join(tmpDir, 'wrong-version.json');
      const data = {
        metadata: {
          exported_at: new Date().toISOString(),
          exported_by: 'paymongo-cli',
          version: '99.0',
          environment: 'test',
        },
        data: [sampleWebhook],
      };
      await fs.writeFile(filepath, JSON.stringify(data), 'utf-8');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'UNSUPPORTED_VERSION',
      });
    });

    it('should throw PayMongoError for empty data', async () => {
      const filepath = path.join(tmpDir, 'empty-data.json');
      const data = {
        metadata: {
          exported_at: new Date().toISOString(),
          exported_by: 'paymongo-cli',
          version: '1.0',
          environment: 'test',
        },
        data: [],
      };
      await fs.writeFile(filepath, JSON.stringify(data), 'utf-8');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'EMPTY_FILE',
      });
    });

    it('should throw PayMongoError for invalid webhook data (wrong type)', async () => {
      const filepath = path.join(tmpDir, 'wrong-type.json');
      const data = {
        metadata: {
          exported_at: new Date().toISOString(),
          exported_by: 'paymongo-cli',
          version: '1.0',
          environment: 'test',
        },
        data: [
          {
            id: 'hook_xxx',
            type: 'payment',
            attributes: { url: 'https://example.com', events: ['payment.paid'] },
          },
        ],
      };
      await fs.writeFile(filepath, JSON.stringify(data), 'utf-8');

      await expect(BulkOperations.importWebhooks(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importWebhooks(filepath)).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_TYPE',
      });
    });
  });

  describe('importPayments', () => {
    it('should successfully import valid payment export', async () => {
      const filepath = path.join(tmpDir, 'payments.json');
      await BulkOperations.exportPayments([samplePayment], filepath, 'test');

      const result = await BulkOperations.importPayments(filepath);

      expect(result.payments).toEqual([samplePayment]);
      expect(result.metadata.exported_by).toBe('paymongo-cli');
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.environment).toBe('test');
    });

    it('should throw PayMongoError with FILE_NOT_FOUND for missing file', async () => {
      const filepath = path.join(tmpDir, 'nonexistent.json');

      await expect(BulkOperations.importPayments(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importPayments(filepath)).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('should throw PayMongoError with INVALID_JSON for malformed JSON', async () => {
      const filepath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filepath, 'not json at all', 'utf-8');

      await expect(BulkOperations.importPayments(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importPayments(filepath)).rejects.toMatchObject({
        code: 'INVALID_JSON',
      });
    });

    it('should throw PayMongoError for invalid payment data (wrong type)', async () => {
      const filepath = path.join(tmpDir, 'wrong-type.json');
      const data = {
        metadata: {
          exported_at: new Date().toISOString(),
          exported_by: 'paymongo-cli',
          version: '1.0',
          environment: 'test',
        },
        data: [{ id: 'pay_xxx', type: 'webhook', attributes: { amount: 10000, currency: 'PHP' } }],
      };
      await fs.writeFile(filepath, JSON.stringify(data), 'utf-8');

      await expect(BulkOperations.importPayments(filepath)).rejects.toThrow(PayMongoError);
      await expect(BulkOperations.importPayments(filepath)).rejects.toMatchObject({
        code: 'INVALID_PAYMENT_TYPE',
      });
    });
  });

  describe('generateFilename', () => {
    it('should return correct format with type, environment, and date', () => {
      const filename = BulkOperations.generateFilename('webhooks', 'test');

      expect(filename).toMatch(/^webhooks_test_\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should return correct format for payments', () => {
      const filename = BulkOperations.generateFilename('payments', 'live');

      expect(filename).toMatch(/^payments_live_\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe('ensureJsonExtension', () => {
    it('should add .json when extension is missing', () => {
      expect(BulkOperations.ensureJsonExtension('export')).toBe('export.json');
    });

    it('should not double-add .json when already present', () => {
      expect(BulkOperations.ensureJsonExtension('export.json')).toBe('export.json');
    });

    it('should add .json when file has a different extension', () => {
      expect(BulkOperations.ensureJsonExtension('export.txt')).toBe('export.txt.json');
    });

    it('should handle .JSON case-insensitively', () => {
      expect(BulkOperations.ensureJsonExtension('export.JSON')).toBe('export.JSON');
    });
  });
});
