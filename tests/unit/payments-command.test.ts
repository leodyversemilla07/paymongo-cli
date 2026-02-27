import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock modules before importing payments command
const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockConfigManager = {
  load: mockConfigManagerLoad,
};

const mockApiClientListPayments = jest.fn<(limit: number) => Promise<any[]>>();
const mockApiClientGetPayment = jest.fn<(id: string) => Promise<any>>();
const mockApiClientCreatePaymentIntent =
  jest.fn<(amount: number, currency: string, description?: string) => Promise<any>>();
const mockApiClientConfirmPaymentIntent =
  jest.fn<(intentId: string, paymentMethodId: string, returnUrl?: string) => Promise<any>>();
const mockApiClientCapturePaymentIntent = jest.fn<(intentId: string) => Promise<any>>();
const mockApiClientCreateRefund =
  jest.fn<(paymentId: string, amount: number, reason: string) => Promise<any>>();
const mockApiClient = jest.fn().mockImplementation(() => ({
  listPayments: mockApiClientListPayments,
  getPayment: mockApiClientGetPayment,
  createPaymentIntent: mockApiClientCreatePaymentIntent,
  confirmPaymentIntent: mockApiClientConfirmPaymentIntent,
  capturePaymentIntent: mockApiClientCapturePaymentIntent,
  createRefund: mockApiClientCreateRefund,
}));

const mockPaymentSimulator = jest.fn().mockImplementation(() => ({
  simulatePaymentConfirmation: jest.fn<(intentId: string, options: any) => Promise<any>>(),
}));

const mockBulkOperationsGenerateFilename = jest.fn<(type: string, environment: string) => string>();
const mockBulkOperationsEnsureJsonExtension = jest.fn<(filename: string) => string>();
const mockBulkOperationsExportPayments =
  jest.fn<(payments: any[], filename: string, environment: string) => Promise<void>>();
const mockBulkOperationsImportPayments = jest.fn<(filename: string) => Promise<any>>();
const mockBulkOperations = {
  generateFilename: mockBulkOperationsGenerateFilename,
  ensureJsonExtension: mockBulkOperationsEnsureJsonExtension,
  exportPayments: mockBulkOperationsExportPayments,
  importPayments: mockBulkOperationsImportPayments,
};

const mockSpinnerStart = jest.fn<(message: string) => void>();
const mockSpinnerSucceed = jest.fn<(message: string) => void>();
const mockSpinnerFail = jest.fn<(message: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();
const mockSpinner = jest.fn().mockImplementation(() => ({
  start: mockSpinnerStart,
  succeed: mockSpinnerSucceed,
  fail: mockSpinnerFail,
  stop: mockSpinnerStop,
}));

// Mock chalk
const mockChalkRed = jest.fn((text: string) => `red:${text}`);
const mockChalkYellow = jest.fn((text: string) => `yellow:${text}`);
const mockChalkGreen = jest.fn((text: string) => `green:${text}`);
const mockChalkGray = jest.fn((text: string) => `gray:${text}`);
const mockChalkBold = jest.fn((text: string) => `bold:${text}`);
const mockChalkCyan = jest.fn((text: string) => `cyan:${text}`);
const mockChalkWhite = jest.fn((text: string) => `white:${text}`);

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => mockConfigManager),
}));

jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  default: mockApiClient,
}));

jest.unstable_mockModule('../../src/services/payments/simulator.js', () => ({
  PaymentSimulator: mockPaymentSimulator,
}));

jest.unstable_mockModule('../../src/utils/bulk.js', () => ({
  BulkOperations: mockBulkOperations,
}));

jest.unstable_mockModule('../../src/utils/spinner.js', () => ({
  default: mockSpinner,
}));

jest.unstable_mockModule('chalk', () => ({
  default: {
    red: mockChalkRed,
    yellow: mockChalkYellow,
    green: mockChalkGreen,
    gray: mockChalkGray,
    bold: mockChalkBold,
    cyan: mockChalkCyan,
    white: mockChalkWhite,
  },
}));

// Mock console methods
let mockConsoleLog: any;
let mockConsoleError: any;

// Mock process.exit
let mockProcessExit: any;

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => mockConfigManager),
}));

jest.unstable_mockModule('../../src/services/api/client.js', () => ({
  default: mockApiClient,
}));

jest.unstable_mockModule('../../src/services/payments/simulator.js', () => ({
  PaymentSimulator: mockPaymentSimulator,
}));

jest.unstable_mockModule('../../src/utils/bulk.js', () => ({
  BulkOperations: mockBulkOperations,
}));

jest.unstable_mockModule('../../src/utils/spinner.js', () => ({
  default: mockSpinner,
}));

jest.unstable_mockModule('chalk', () => ({
  default: {
    red: mockChalkRed,
    yellow: mockChalkYellow,
    green: mockChalkGreen,
    gray: mockChalkGray,
    bold: mockChalkBold,
    cyan: mockChalkCyan,
    white: mockChalkWhite,
  },
}));

// Import after mocking
const {
  exportAction,
  importAction,
  listAction,
  showAction,
  createIntentAction,
  confirmAction,
  captureAction,
  refundAction,
} = await import('../../src/commands/payments.js');

describe('Payments Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log');
    mockConsoleError = jest.spyOn(console, 'error');
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('export command', () => {
    it('should export payments successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockPayments = [
        {
          id: 'pay_123',
          attributes: {
            amount: 10000,
            currency: 'PHP',
            status: 'paid',
            created_at: Date.now() / 1000,
          },
        },
      ];

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue(mockPayments);
      mockBulkOperationsGenerateFilename.mockReturnValue('payments-test-20231225.json');
      mockBulkOperationsExportPayments.mockResolvedValue(undefined);

      await exportAction({ limit: '10' });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientListPayments).toHaveBeenCalledWith(10);
      expect(mockBulkOperationsGenerateFilename).toHaveBeenCalledWith('payments', 'test');
      expect(mockBulkOperationsExportPayments).toHaveBeenCalledWith(
        mockPayments,
        'payments-test-20231225.json',
        'test'
      );
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Fetching up to 10 payments...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Found 1 payments');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Exporting to payments-test-20231225.json...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Export completed');
    });

    it('should handle custom filename', async () => {
      const mockConfig = { environment: 'live' };
      const mockPayments = [
        {
          id: 'pay_456',
          attributes: {
            amount: 5000,
            currency: 'PHP',
            status: 'paid',
            created_at: Date.now() / 1000,
          },
        },
      ];

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue(mockPayments);
      mockBulkOperationsEnsureJsonExtension.mockReturnValue('custom-export.json');
      mockBulkOperationsExportPayments.mockResolvedValue(undefined);

      await exportAction({ file: 'custom-export', limit: '5' });

      expect(mockBulkOperationsEnsureJsonExtension).toHaveBeenCalledWith('custom-export');
      expect(mockBulkOperationsExportPayments).toHaveBeenCalledWith(
        mockPayments,
        'custom-export.json',
        'live'
      );
    });

    it('should handle no configuration found', async () => {
      mockConfigManagerLoad.mockResolvedValue(null);

      await exportAction({ limit: '10' });

      expect(mockSpinnerFail).toHaveBeenCalledWith('No configuration found');
      expect(mockConsoleLog).toHaveBeenCalledWith('yellow:No PayMongo configuration found.');
    });

    it('should handle invalid limit', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(exportAction({ limit: 'invalid' })).rejects.toThrow('Command failed');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'red:❌ Failed to export payments:',
        'Limit must be a number between 1 and 1000'
      );
    });

    it('should handle no payments found', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue([]);

      await exportAction({ limit: '10' });

      expect(mockConsoleLog).toHaveBeenCalledWith('yellow:No payments found to export.');
    });
  });

  describe('list command', () => {
    it('should list payments successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockPayments = [
        {
          id: 'pay_123',
          attributes: {
            amount: 10000,
            currency: 'PHP',
            status: 'paid',
            created_at: Date.now() / 1000,
          },
        },
      ];

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue(mockPayments);

      await listAction({ limit: '5', json: false });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientListPayments).toHaveBeenCalledWith(5);
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Fetching payments...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Found 1 payments');
    });

    it('should output JSON when requested', async () => {
      const mockConfig = { environment: 'test' };
      const mockPayments = [
        {
          id: 'pay_456',
          attributes: {
            amount: 5000,
            currency: 'PHP',
            status: 'paid',
            created_at: Date.now() / 1000,
          },
        },
      ];

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue(mockPayments);

      await listAction({ limit: '10', json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockPayments, null, 2));
    });

    it('should handle no payments found', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientListPayments.mockResolvedValue([]);

      await listAction({ limit: '10', json: false });

      expect(mockConsoleLog).toHaveBeenCalledWith('gray:No payments found.');
    });
  });

  describe('show command', () => {
    it('should show payment details successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockPayment = {
        id: 'pay_123',
        attributes: {
          amount: 10000,
          currency: 'PHP',
          status: 'paid',
          description: 'Test payment',
          external_reference_number: 'REF123',
          paid_at: Date.now() / 1000,
          created_at: Date.now() / 1000,
          updated_at: Date.now() / 1000,
          fees: 250,
          net_amount: 9750,
          source: {
            attributes: {
              type: 'gcash',
            },
          },
          payment_intent_id: 'pi_123',
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientGetPayment.mockResolvedValue(mockPayment);

      await showAction('pay_123', { json: false });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientGetPayment).toHaveBeenCalledWith('pay_123');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Fetching payment details...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Payment details loaded');
    });

    it('should output JSON when requested', async () => {
      const mockConfig = { environment: 'test' };
      const mockPayment = {
        id: 'pay_456',
        attributes: {
          amount: 5000,
          currency: 'PHP',
          status: 'paid',
          created_at: Date.now() / 1000,
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientGetPayment.mockResolvedValue(mockPayment);

      await showAction('pay_456', { json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockPayment, null, 2));
    });
  });

  describe('create-intent command', () => {
    it('should create payment intent successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockPaymentIntent = {
        id: 'pi_123',
        attributes: {
          amount: 10000,
          currency: 'PHP',
          status: 'awaiting_payment_method',
          description: 'Test payment',
          created_at: Date.now() / 1000,
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientCreatePaymentIntent.mockResolvedValue(mockPaymentIntent);

      await createIntentAction({
        amount: '10000',
        currency: 'PHP',
        description: 'Test payment',
        json: false,
      });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientCreatePaymentIntent).toHaveBeenCalledWith(10000, 'PHP', 'Test payment');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Creating payment intent...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Payment intent created');
    });

    it('should validate amount', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(createIntentAction({ amount: 'invalid', currency: 'PHP' })).rejects.toThrow('Command failed');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'red:❌ Failed to create payment intent:',
        'Amount must be a positive number in centavos'
      );
    });
  });

  describe('confirm command', () => {
    it('should confirm payment intent successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockResult = {
        id: 'pi_123',
        attributes: {
          amount: 10000,
          currency: 'PHP',
          status: 'succeeded',
          description: 'Test payment',
          created_at: Date.now() / 1000,
          updated_at: Date.now() / 1000,
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientConfirmPaymentIntent.mockResolvedValue(mockResult);

      await confirmAction('pi_123', {
        paymentMethod: 'pm_456',
        returnUrl: 'https://example.com',
        simulate: false,
        json: false,
      });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientConfirmPaymentIntent).toHaveBeenCalledWith(
        'pi_123',
        'pm_456',
        'https://example.com'
      );
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Confirming payment intent...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Payment intent confirmed');
    });

    it('should require payment method when not simulating', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(confirmAction('pi_123', { simulate: false })).rejects.toThrow('Command failed');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'red:❌ Failed to confirm payment intent:',
        'Payment method ID is required. Use --payment-method <id>'
      );
    });

    it('should handle simulation mode', async () => {
      const mockConfig = { environment: 'test' };
      const mockSimulatorResult = {
        paymentIntent: {
          id: 'pi_123',
          attributes: {
            amount: 10000,
            currency: 'PHP',
            status: 'succeeded',
            description: 'Test payment',
            created_at: Date.now() / 1000,
            updated_at: Date.now() / 1000,
          },
        },
        simulationType: 'gcash_success',
        delayApplied: 2000,
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      const mockSimulatorInstance = {
        simulatePaymentConfirmation: jest
          .fn<(intentId: string, options: any) => Promise<any>>()
          .mockResolvedValue(mockSimulatorResult),
      };
      mockPaymentSimulator.mockImplementation(() => mockSimulatorInstance);

      await confirmAction('pi_123', {
        simulate: true,
        method: 'gcash',
        outcome: 'success',
        json: false,
      });

      expect(mockSimulatorInstance.simulatePaymentConfirmation).toHaveBeenCalledWith('pi_123', {
        paymentMethod: 'gcash',
        outcome: 'success',
      });
      expect(mockSpinnerStart).toHaveBeenCalledWith('Simulating gcash payment...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Simulation completed (2000ms)');
    });
  });

  describe('capture command', () => {
    it('should capture payment intent successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockResult = {
        id: 'pi_123',
        attributes: {
          amount: 10000,
          currency: 'PHP',
          status: 'succeeded',
          description: 'Test payment',
          updated_at: Date.now() / 1000,
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientCapturePaymentIntent.mockResolvedValue(mockResult);

      await captureAction('pi_123', { json: false });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientCapturePaymentIntent).toHaveBeenCalledWith('pi_123');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Capturing payment intent...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Payment intent captured');
    });
  });

  describe('refund command', () => {
    it('should create refund successfully', async () => {
      const mockConfig = { environment: 'test' };
      const mockRefund = {
        id: 'ref_123',
        attributes: {
          payment_id: 'pay_456',
          amount: 5000,
          currency: 'PHP',
          status: 'succeeded',
          reason: 'requested_by_customer',
          created_at: Date.now() / 1000,
        },
      };

      mockConfigManagerLoad.mockResolvedValue(mockConfig);
      mockApiClientCreateRefund.mockResolvedValue(mockRefund);

      await refundAction('pay_456', {
        amount: '5000',
        reason: 'requested_by_customer',
        json: false,
      });

      expect(mockConfigManagerLoad).toHaveBeenCalledTimes(1);
      expect(mockApiClientCreateRefund).toHaveBeenCalledWith(
        'pay_456',
        5000,
        'requested_by_customer'
      );
      expect(mockSpinnerStart).toHaveBeenCalledWith('Loading configuration...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Configuration loaded');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Creating refund...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Refund created');
    });

    it('should validate refund reason', async () => {
      const mockConfig = { environment: 'test' };
      mockConfigManagerLoad.mockResolvedValue(mockConfig);

      await expect(refundAction('pay_456', { reason: 'invalid_reason' })).rejects.toThrow('Command failed');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'red:❌ Failed to create refund:',
        'Invalid reason. Must be one of: duplicate, fraudulent, requested_by_customer'
      );
    });
  });

  describe('import command', () => {
    it('should import payments successfully', async () => {
      const mockImportedData = {
        payments: [
          {
            id: 'pay_123',
            attributes: {
              amount: 10000,
              currency: 'PHP',
              status: 'paid',
              created_at: Date.now() / 1000,
            },
          },
        ],
        metadata: {
          environment: 'live',
          exported_at: Date.now(),
          version: '1.0.0',
        },
      };

      mockBulkOperationsImportPayments.mockResolvedValue(mockImportedData);

      await importAction('payments.json', { json: false });

      expect(mockBulkOperationsImportPayments).toHaveBeenCalledWith('payments.json');
      expect(mockSpinnerStart).toHaveBeenCalledWith('Importing payments from payments.json...');
      expect(mockSpinnerSucceed).toHaveBeenCalledWith('Loaded 1 payments from export');
    });

    it('should output JSON when requested', async () => {
      const mockImportedData = {
        payments: [
          {
            id: 'pay_456',
            attributes: {
              amount: 5000,
              currency: 'PHP',
              status: 'paid',
              created_at: Date.now() / 1000,
            },
          },
        ],
        metadata: { environment: 'test', exported_at: Date.now(), version: '1.0.0' },
      };

      mockBulkOperationsImportPayments.mockResolvedValue(mockImportedData);

      await importAction('payments.json', { json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockImportedData, null, 2));
    });
  });
});
