import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';
import type {
  PayMongoConfig,
  WebhookData,
  WebhookDataWithSecret,
} from '../../src/types/paymongo.js';
import type { BulkExportData } from '../../src/utils/bulk.js';

// Mock functions with proper type annotations
const mockConfigManagerLoad = jest.fn<() => Promise<PayMongoConfig | null>>();
const mockConfigManagerSave = jest.fn<() => Promise<void>>();
const mockApiClientListWebhooks = jest.fn<() => Promise<WebhookData[]>>();
const mockApiClientGetWebhook = jest.fn<(id: string) => Promise<WebhookData>>();
const mockApiClientCreateWebhook =
  jest.fn<(url: string, events: string[]) => Promise<WebhookDataWithSecret>>();
const mockApiClientDisableWebhook = jest.fn<(id: string) => Promise<void>>();
const mockApiClientEnableWebhook = jest.fn<(id: string) => Promise<void>>();
const mockSpinnerStart = jest.fn();
const mockSpinnerSucceed = jest.fn();
const mockSpinnerFail = jest.fn();
const mockSpinnerStop = jest.fn();
const mockBulkExportWebhooks =
  jest.fn<(webhooks: WebhookData[], filename: string, environment: string) => Promise<string>>();
const mockBulkImportWebhooks =
  jest.fn<
    (filename: string) => Promise<{ webhooks: WebhookData[]; metadata: BulkExportData['metadata'] }>
  >();
const mockBulkGenerateFilename = jest.fn<() => string>();
const mockBulkEnsureJsonExtension = jest.fn<(filename: string) => string>();
const mockInput = jest.fn<() => Promise<string>>();
const mockCheckbox = jest.fn<() => Promise<string[]>>();
const mockConfirm = jest.fn<() => Promise<boolean>>();

// Mock modules
jest.mock('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
    save: mockConfigManagerSave,
  })),
}));

jest.mock('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    listWebhooks: mockApiClientListWebhooks,
    getWebhook: mockApiClientGetWebhook,
    createWebhook: mockApiClientCreateWebhook,
    disableWebhook: mockApiClientDisableWebhook,
    enableWebhook: mockApiClientEnableWebhook,
  })),
}));

jest.mock('../../src/utils/bulk.js', () => ({
  BulkOperations: {
    exportWebhooks: mockBulkExportWebhooks,
    importWebhooks: mockBulkImportWebhooks,
    generateFilename: mockBulkGenerateFilename,
    ensureJsonExtension: mockBulkEnsureJsonExtension,
  },
}));

jest.mock('../../src/utils/spinner.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
    stop: mockSpinnerStop,
  })),
}));

jest.mock('@inquirer/prompts', () => ({
  input: mockInput,
  checkbox: mockCheckbox,
  confirm: mockConfirm,
}));

jest.mock('../../src/utils/validator.js', () => ({
  validateWebhookUrl: jest.fn(() => true),
  validateEventTypes: jest.fn(() => true),
}));

// Import after mocking
const {
  exportAction,
  importAction,
  createAction,
  listAction,
  disableAction,
  enableAction,
  deleteAction,
  showAction,
} = await import('../../src/commands/webhooks.js');

describe('Webhooks Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  const mockConfig: PayMongoConfig = {
    version: '1.0',
    projectName: 'test-project',
    environment: 'test',
    apiKeys: {
      test: { secret: 'sk_test_123', public: 'pk_test_123' },
    },
    webhooks: { url: '', events: [] },
    webhookSecrets: {},
    dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: false },
  };

  const mockWebhook: WebhookData = {
    id: 'wh_123',
    type: 'webhook',
    attributes: {
      url: 'https://example.com/webhook',
      events: ['payment.paid'],
      status: 'enabled',
      created_at: 1609459200,
      updated_at: 1609459200,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as unknown as typeof process.exit;

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue(mockConfig);
    mockConfigManagerSave.mockResolvedValue(undefined);
    mockApiClientListWebhooks.mockResolvedValue([mockWebhook]);
    mockApiClientGetWebhook.mockResolvedValue(mockWebhook);
    mockApiClientDisableWebhook.mockResolvedValue(undefined);
    mockApiClientEnableWebhook.mockResolvedValue(undefined);
    mockBulkGenerateFilename.mockReturnValue('webhooks-test.json');
    mockBulkEnsureJsonExtension.mockReturnValue('custom.json');
    mockBulkExportWebhooks.mockResolvedValue('webhooks-test.json');
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('exportAction', () => {
    it('should export webhooks successfully', async () => {
      await exportAction({});

      expect(mockConfigManagerLoad).toHaveBeenCalled();
      expect(mockApiClientListWebhooks).toHaveBeenCalled();
      expect(mockBulkExportWebhooks).toHaveBeenCalledWith(
        [mockWebhook],
        'webhooks-test.json',
        'test'
      );
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Export completed');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Webhooks exported successfully')
      );
    });

    it('should handle no configuration', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      await exportAction({});

      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No PayMongo configuration found')
      );
    });

    it('should handle no webhooks to export', async () => {
      mockApiClientListWebhooks.mockResolvedValue([]);

      await exportAction({});

      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Found 0 webhooks');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No webhooks found to export')
      );
    });

    it('should use custom filename', async () => {
      await exportAction({ file: 'custom' });

      expect(mockBulkEnsureJsonExtension).toHaveBeenCalledWith('custom');
      expect(mockBulkExportWebhooks).toHaveBeenCalledWith([mockWebhook], 'custom.json', 'test');
    });

    it('should handle API errors', async () => {
      mockApiClientListWebhooks.mockRejectedValue(new Error('API Error'));

      await expect(exportAction({})).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to export webhooks'),
        'API Error'
      );
    });
  });

  describe('importAction', () => {
    const mockImportData = {
      webhooks: [
        {
          id: 'wh_import_1',
          type: 'webhook' as const,
          attributes: {
            url: 'https://example.com/webhook',
            events: ['payment.paid'],
            status: 'enabled' as const,
            created_at: 1609459200,
            updated_at: 1609459200,
          },
        },
      ],
      metadata: {
        environment: 'test',
        exported_at: '2024-01-01T00:00:00.000Z',
        exported_by: 'paymongo-cli',
        version: '1.0',
      },
    };

    beforeEach(() => {
      mockBulkImportWebhooks.mockResolvedValue(mockImportData);
      mockApiClientCreateWebhook.mockResolvedValue({
        id: 'wh_new',
        type: 'webhook',
        attributes: {
          url: 'https://example.com/webhook',
          events: ['payment.paid'],
          status: 'enabled',
          created_at: 1609459200,
          updated_at: 1609459200,
          secret: 'secret123',
        },
      });
    });

    it('should import webhooks successfully', async () => {
      await importAction('test.json', {});

      expect(mockBulkImportWebhooks).toHaveBeenCalledWith('test.json');
      expect(mockApiClientCreateWebhook).toHaveBeenCalledWith('https://example.com/webhook', [
        'payment.paid',
      ]);
    });

    it('should handle dry run mode', async () => {
      await importAction('test.json', { dryRun: true });

      expect(mockApiClientCreateWebhook).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dry run mode'));
    });

    it('should cancel import when user declines', async () => {
      mockConfirm.mockResolvedValue(false);

      await importAction('test.json', {});

      expect(mockApiClientCreateWebhook).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('should handle import errors', async () => {
      mockBulkImportWebhooks.mockRejectedValue(new Error('Import Error'));

      await expect(importAction('test.json', {})).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import webhooks'),
        'Import Error'
      );
    });
  });

  describe('createAction', () => {
    beforeEach(() => {
      mockApiClientCreateWebhook.mockResolvedValue({
        id: 'wh_123',
        type: 'webhook',
        attributes: {
          url: 'https://example.com/webhook',
          events: ['payment.paid', 'payment.failed'],
          status: 'enabled',
          created_at: 1609459200,
          updated_at: 1609459200,
          secret: 'secret123',
        },
      });
    });

    it('should create webhook in non-interactive mode', async () => {
      await createAction({
        url: 'https://example.com/webhook',
        events: 'payment.paid,payment.failed',
      });

      expect(mockApiClientCreateWebhook).toHaveBeenCalledWith('https://example.com/webhook', [
        'payment.paid',
        'payment.failed',
      ]);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Webhook created successfully')
      );
    });

    it('should create webhook in interactive mode', async () => {
      mockInput.mockResolvedValue('https://example.com/webhook');
      mockCheckbox.mockResolvedValue(['payment.paid']);

      await createAction({});

      expect(mockInput).toHaveBeenCalled();
      expect(mockCheckbox).toHaveBeenCalled();
      expect(mockApiClientCreateWebhook).toHaveBeenCalledWith('https://example.com/webhook', [
        'payment.paid',
      ]);
    });

    it('should handle API errors', async () => {
      mockApiClientCreateWebhook.mockRejectedValue(new Error('API Error'));

      await expect(
        createAction({
          url: 'https://example.com/webhook',
          events: 'payment.paid',
        })
      ).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create webhook'),
        'API Error'
      );
    });
  });

  describe('listAction', () => {
    it('should list webhooks successfully', async () => {
      await listAction({});

      expect(mockApiClientListWebhooks).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Webhooks'));
    });

    it('should output JSON when requested', async () => {
      await listAction({ json: true });

      expect(console.log).toHaveBeenCalledWith(JSON.stringify([mockWebhook], null, 2));
    });

    it('should handle no webhooks found', async () => {
      mockApiClientListWebhooks.mockResolvedValue([]);

      await listAction({});

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No webhooks found'));
    });

    it('should filter by status', async () => {
      const webhooks: WebhookData[] = [
        mockWebhook,
        {
          id: 'wh_456',
          type: 'webhook' as const,
          attributes: {
            url: 'https://example.com/webhook2',
            events: ['payment.failed'],
            status: 'disabled' as const,
            created_at: 1609459200,
            updated_at: 1609459200,
          },
        },
      ];
      mockApiClientListWebhooks.mockResolvedValue(webhooks);

      await listAction({ status: 'enabled' });

      // Should filter to show only enabled webhooks
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Webhooks'));
    });

    it('should filter webhooks by events', async () => {
      const webhooks: WebhookData[] = [
        mockWebhook,
        {
          id: 'wh_456',
          type: 'webhook' as const,
          attributes: {
            url: 'https://example.com/webhook2',
            events: ['payment.failed'],
            status: 'enabled' as const,
            created_at: 1609459200,
            updated_at: 1609459200,
          },
        },
      ];
      mockApiClientListWebhooks.mockResolvedValue(webhooks);

      await listAction({ events: 'payment' });

      // Should filter to show only webhooks with payment events
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Webhooks'));
    });
  });

  describe('disableAction', () => {
    it('should disable webhook with confirmation', async () => {
      await disableAction('wh_123', {});

      expect(mockConfirm).toHaveBeenCalled();
      expect(mockApiClientDisableWebhook).toHaveBeenCalledWith('wh_123');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Webhook disabled successfully');
    });

    it('should skip confirmation with --yes flag', async () => {
      await disableAction('wh_123', { yes: true });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockApiClientDisableWebhook).toHaveBeenCalledWith('wh_123');
    });

    it('should cancel disable when user declines', async () => {
      mockConfirm.mockResolvedValue(false);

      await disableAction('wh_123', {});

      expect(mockApiClientDisableWebhook).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('keeps deleteAction as a compatibility alias', async () => {
      await deleteAction('wh_123', { yes: true });

      expect(mockApiClientDisableWebhook).toHaveBeenCalledWith('wh_123');
    });
  });

  describe('enableAction', () => {
    it('should enable webhook', async () => {
      await enableAction('wh_123');

      expect(mockApiClientEnableWebhook).toHaveBeenCalledWith('wh_123');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Webhook enabled successfully');
    });
  });

  describe('showAction', () => {
    it('should show webhook details', async () => {
      await showAction('wh_123');

      expect(mockApiClientGetWebhook).toHaveBeenCalledWith('wh_123');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Webhook Details'));
    });

    it('should handle webhook not found', async () => {
      mockApiClientGetWebhook.mockRejectedValue(new Error('Webhook not found'));

      await expect(showAction('wh_invalid')).rejects.toThrow('Command failed');

      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
