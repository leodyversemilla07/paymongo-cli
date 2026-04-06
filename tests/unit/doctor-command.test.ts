import { afterEach, beforeEach, describe, expect, it, vi as jest } from 'vitest';

const mockConfigManagerLoad = jest.fn<() => Promise<any>>();
const mockApiClientValidateApiKey = jest.fn<() => Promise<void>>();

jest.mock('../../src/services/config/manager.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    load: mockConfigManagerLoad,
  })),
}));

jest.mock('../../src/services/api/client.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateApiKey: mockApiClientValidateApiKey,
  })),
}));

const { doctorAction } = await import('../../src/commands/doctor.js');

describe('Doctor Command', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalNgrokToken = process.env.NGROK_AUTHTOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    delete process.env.NGROK_AUTHTOKEN;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    if (originalNgrokToken === undefined) {
      delete process.env.NGROK_AUTHTOKEN;
    } else {
      process.env.NGROK_AUTHTOKEN = originalNgrokToken;
    }
  });

  it('fails when configuration is missing', async () => {
    mockConfigManagerLoad.mockResolvedValue(null);

    await expect(doctorAction({})).rejects.toThrow('Command failed');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('PayMongo CLI Doctor'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No .paymongo configuration found.')
    );
  });

  it('passes local checks and skips network when requested', async () => {
    process.env.NGROK_AUTHTOKEN = 'token';
    mockConfigManagerLoad.mockResolvedValue({
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: {
        test: {
          public: 'pk_test_12345678901234567890',
          secret: 'sk_test_12345678901234567890',
        },
      },
      webhooks: {
        url: 'http://localhost:3000/webhook',
        events: ['payment.paid'],
      },
      webhookSecrets: { wh_123: 'whsec_123' },
      registeredWebhooks: [{ id: 'wh_123', url: 'https://example.ngrok.io/webhook', createdAt: 1 }],
      dev: {
        port: 3000,
        autoRegisterWebhook: true,
        verifyWebhookSignatures: true,
      },
    });

    await expect(doctorAction({ network: false })).resolves.toBeUndefined();
    expect(mockApiClientValidateApiKey).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0 failed'));
  });

  it('fails when live API validation fails', async () => {
    mockConfigManagerLoad.mockResolvedValue({
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: {
        test: {
          public: 'pk_test_12345678901234567890',
          secret: 'sk_test_12345678901234567890',
        },
      },
      webhooks: {
        url: 'http://localhost:3000/webhook',
        events: ['payment.paid'],
      },
      webhookSecrets: {},
      dev: {
        port: 3000,
        autoRegisterWebhook: true,
        verifyWebhookSignatures: false,
      },
    });
    mockApiClientValidateApiKey.mockRejectedValue(new Error('boom'));

    await expect(doctorAction({})).rejects.toThrow('Command failed');
    expect(mockApiClientValidateApiKey).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
  });

  it('outputs json when requested', async () => {
    mockConfigManagerLoad.mockResolvedValue({
      version: '1.0',
      projectName: 'test-project',
      environment: 'test',
      apiKeys: {},
      webhooks: {
        url: 'http://localhost:3000/webhook',
        events: ['payment.paid'],
      },
      webhookSecrets: {},
      dev: {
        port: 3000,
        autoRegisterWebhook: false,
        verifyWebhookSignatures: false,
      },
    });

    await expect(doctorAction({ json: true, network: false })).rejects.toThrow('Command failed');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"checks"'));
  });
});
