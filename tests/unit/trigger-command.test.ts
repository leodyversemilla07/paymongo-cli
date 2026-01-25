import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

// Mock modules before importing
const mockConfigManagerLoad = jest.fn<() => Promise<PayMongoConfig | null>>();
const mockSpinnerStart = jest.fn<(text?: string) => void>();
const mockSpinnerSucceed = jest.fn<(text?: string) => void>();
const mockSpinnerFail = jest.fn<(text?: string) => void>();
const mockSpinnerStop = jest.fn<() => void>();
const mockWebhookStoreSaveEvent = jest.fn<() => Promise<void>>();
const mockWebhookStoreClearEvents = jest.fn<() => Promise<void>>();
const mockWebhookStoreGetEvents = jest.fn<() => Promise<unknown[]>>();
const mockWebhookStoreGetEventById = jest.fn<() => Promise<unknown | null>>();

jest.unstable_mockModule('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
  })),
}));

jest.unstable_mockModule('../../src/utils/spinner.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    start: mockSpinnerStart,
    succeed: mockSpinnerSucceed,
    fail: mockSpinnerFail,
    stop: mockSpinnerStop,
  })),
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.unstable_mockModule('../../src/utils/webhook-store.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    saveEvent: mockWebhookStoreSaveEvent,
    clearEvents: mockWebhookStoreClearEvents,
    getEvents: mockWebhookStoreGetEvents,
    getEventById: mockWebhookStoreGetEventById,
  })),
}));

// Mock @inquirer/prompts
jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: jest.fn(),
  input: jest.fn(),
  confirm: jest.fn(),
}));

// Import after mocking
const { default: triggerCommand } = await import('../../src/commands/trigger.js');

describe('Trigger Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as unknown as typeof process.exit;

    // Default mock implementations
    mockConfigManagerLoad.mockResolvedValue(null);
    mockWebhookStoreSaveEvent.mockResolvedValue(undefined);
    mockWebhookStoreClearEvents.mockResolvedValue(undefined);
    mockWebhookStoreGetEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('command structure', () => {
    it('should have the correct name', () => {
      expect(triggerCommand.name()).toBe('trigger');
    });

    it('should have the correct description', () => {
      expect(triggerCommand.description()).toBe('Simulate webhook events locally');
    });

    it('should have send subcommand', () => {
      const sendCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'send');
      expect(sendCmd).toBeDefined();
      expect(sendCmd?.description()).toBe('Send a new webhook event');
    });

    it('should have replay subcommand', () => {
      const replayCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'replay');
      expect(replayCmd).toBeDefined();
      expect(replayCmd?.description()).toBe('Replay a previously sent webhook event');
    });

    it('should have clear subcommand', () => {
      const clearCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'clear');
      expect(clearCmd).toBeDefined();
      expect(clearCmd?.description()).toBe('Clear stored webhook events');
    });
  });

  describe('send subcommand options', () => {
    it('should have event option', () => {
      const sendCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'send');
      const eventOption = sendCmd?.options.find((opt) => opt.short === '-e');
      expect(eventOption).toBeDefined();
      expect(eventOption?.long).toBe('--event');
    });

    it('should have url option', () => {
      const sendCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'send');
      const urlOption = sendCmd?.options.find((opt) => opt.short === '-u');
      expect(urlOption).toBeDefined();
      expect(urlOption?.long).toBe('--url');
    });

    it('should have json option', () => {
      const sendCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'send');
      const jsonOption = sendCmd?.options.find((opt) => opt.short === '-j');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.long).toBe('--json');
    });
  });

  describe('replay subcommand options', () => {
    it('should have event option', () => {
      const replayCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'replay');
      const eventOption = replayCmd?.options.find((opt) => opt.short === '-e');
      expect(eventOption).toBeDefined();
      expect(eventOption?.long).toBe('--event');
    });

    it('should have url option', () => {
      const replayCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'replay');
      const urlOption = replayCmd?.options.find((opt) => opt.short === '-u');
      expect(urlOption).toBeDefined();
      expect(urlOption?.long).toBe('--url');
    });

    it('should have list option', () => {
      const replayCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'replay');
      const listOption = replayCmd?.options.find((opt) => opt.short === '-l');
      expect(listOption).toBeDefined();
      expect(listOption?.long).toBe('--list');
    });

    it('should have json option', () => {
      const replayCmd = triggerCommand.commands.find((cmd) => cmd.name() === 'replay');
      const jsonOption = replayCmd?.options.find((opt) => opt.short === '-j');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.long).toBe('--json');
    });
  });

  describe('clear subcommand', () => {
    it('should clear stored webhook events', async () => {
      await triggerCommand.parseAsync(['node', 'test', 'clear']);

      expect(mockWebhookStoreClearEvents).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleared all stored webhook events')
      );
    });
  });

  describe('legacy root command options', () => {
    it('should have event option on root command', () => {
      const eventOption = triggerCommand.options.find((opt) => opt.short === '-e');
      expect(eventOption).toBeDefined();
      expect(eventOption?.long).toBe('--event');
    });

    it('should have url option on root command', () => {
      const urlOption = triggerCommand.options.find((opt) => opt.short === '-u');
      expect(urlOption).toBeDefined();
      expect(urlOption?.long).toBe('--url');
    });

    it('should have json option on root command', () => {
      const jsonOption = triggerCommand.options.find((opt) => opt.short === '-j');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.long).toBe('--json');
    });
  });
});
