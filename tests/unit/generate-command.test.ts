import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';

// Mock modules before importing generate command
const mockWriteFile = jest.fn<(path: string, content: string) => Promise<void>>();
const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockInput = jest.fn<() => Promise<string>>();
const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();

jest.mock('fs/promises', () => ({
  default: {
    writeFile: mockWriteFile,
  },
}));

jest.mock('@inquirer/prompts', () => ({
  input: mockInput,
  select: jest.fn(),
  confirm: jest.fn(),
}));

jest.mock('../../src/services/config/manager.js', () => ({
  default: {
    load: mockConfigManagerLoad,
  },
}));

jest.mock('../../src/utils/spinner.js', () => ({
  default: {
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
  },
}));

// Import after mocking
const { default: generate } = await import('../../src/commands/generate.js');

describe('Generate Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue({ apiKey: 'test-key' });
    mockInput.mockResolvedValue('test.js');
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('command structure', () => {
    it('should have the correct name', () => {
      expect(generate.name()).toBe('generate');
    });

    it('should have the correct description', () => {
      expect(generate.description()).toBe('Generate boilerplate code for PayMongo integrations');
    });

    it('should have webhook-handler subcommand', () => {
      const webhookCmd = generate.commands.find((cmd) => cmd.name() === 'webhook-handler');
      expect(webhookCmd).toBeDefined();
      expect(webhookCmd?.description()).toBe('Generate a webhook handler for specific events');
    });

    it('should have payment-intent subcommand', () => {
      const paymentCmd = generate.commands.find((cmd) => cmd.name() === 'payment-intent');
      expect(paymentCmd).toBeDefined();
      expect(paymentCmd?.description()).toBe('Generate payment intent creation code');
    });

    it('should have checkout-page subcommand', () => {
      const checkoutCmd = generate.commands.find((cmd) => cmd.name() === 'checkout-page');
      expect(checkoutCmd).toBeDefined();
      expect(checkoutCmd?.description()).toBe(
        'Generate a basic checkout page with PayMongo integration'
      );
    });
  });

  describe('webhook-handler subcommand options', () => {
    it('should have events option', () => {
      const webhookCmd = generate.commands.find((cmd) => cmd.name() === 'webhook-handler');
      expect(webhookCmd).toBeDefined();

      // Check if the command has the events option
      const options = webhookCmd?.options || [];
      const eventsOption = options.find((opt) => opt.flags.includes('--events'));
      expect(eventsOption).toBeDefined();
    });

    it('should have language option', () => {
      const webhookCmd = generate.commands.find((cmd) => cmd.name() === 'webhook-handler');
      expect(webhookCmd).toBeDefined();

      const options = webhookCmd?.options || [];
      const languageOption = options.find((opt) => opt.flags.includes('--language'));
      expect(languageOption).toBeDefined();
    });

    it('should have framework option', () => {
      const webhookCmd = generate.commands.find((cmd) => cmd.name() === 'webhook-handler');
      expect(webhookCmd).toBeDefined();

      const options = webhookCmd?.options || [];
      const frameworkOption = options.find((opt) => opt.flags.includes('--framework'));
      expect(frameworkOption).toBeDefined();
    });
  });

  describe('payment-intent subcommand options', () => {
    it('should have language option', () => {
      const paymentCmd = generate.commands.find((cmd) => cmd.name() === 'payment-intent');
      expect(paymentCmd).toBeDefined();

      const options = paymentCmd?.options || [];
      const languageOption = options.find((opt) => opt.flags.includes('--language'));
      expect(languageOption).toBeDefined();
    });

    it('should have methods option', () => {
      const paymentCmd = generate.commands.find((cmd) => cmd.name() === 'payment-intent');
      expect(paymentCmd).toBeDefined();

      const options = paymentCmd?.options || [];
      const methodsOption = options.find((opt) => opt.flags.includes('--methods'));
      expect(methodsOption).toBeDefined();
    });
  });

  describe('checkout-page subcommand options', () => {
    it('should have language option', () => {
      const checkoutCmd = generate.commands.find((cmd) => cmd.name() === 'checkout-page');
      expect(checkoutCmd).toBeDefined();

      const options = checkoutCmd?.options || [];
      const languageOption = options.find((opt) => opt.flags.includes('--language'));
      expect(languageOption).toBeDefined();
    });
  });
});
