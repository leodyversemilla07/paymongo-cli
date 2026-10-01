import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';

const mocks = vi.hoisted(() => ({
  createWebhook: vi.fn(),
  disableWebhook: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  forward: vi.fn(),
  close: vi.fn(),
  saveState: vi.fn(),
  clearState: vi.fn(),
  constructServer: vi.fn(),
}));

vi.mock('../../src/services/api/client.js', () => ({
  default: class {
    createWebhook = mocks.createWebhook;
    disableWebhook = mocks.disableWebhook;
  },
}));
vi.mock('../../src/services/dev/server.js', () => ({
  default: class {
    constructor(port: number, config: unknown, options?: unknown) {
      mocks.constructServer(port, config, options);
    }
    start = mocks.start;
    stop = mocks.stop;
  },
}));
vi.mock('@ngrok/ngrok', () => ({
  default: { forward: mocks.forward },
}));
vi.mock('../../src/services/dev/process-manager.js', () => ({
  DevProcessManager: { saveState: mocks.saveState, clearState: mocks.clearState },
}));

const { default: DevSessionService } = await import('../../src/services/dev/session.js');

describe('Dev session webhook registration contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean CI runners and developer shells must use the same mocked auth input.
    vi.stubEnv('NGROK_AUTHTOKEN', 'fixture-ngrok-token');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.forward.mockResolvedValue({ url: () => 'https://example.ngrok.app', close: mocks.close });
    mocks.createWebhook.mockResolvedValue({
      id: 'hook_123',
      type: 'webhook',
      attributes: { secret_key: 'whsk_contract_secret', status: 'enabled' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function createService() {
    const config: PayMongoConfig = {
      version: '1.0',
      projectName: 'forward-contract',
      environment: 'test',
      apiKeys: {},
      webhooks: { url: '', events: [] },
      webhookSecrets: {},
      dev: { port: 4000, autoRegisterWebhook: false, verifyWebhookSignatures: false },
    };
    const load = vi.fn(async () => config);
    const configManager = { load, save: vi.fn() };
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      stop: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
    };
    const service = new DevSessionService({
      configManager: configManager as unknown as ConstructorParameters<
        typeof DevSessionService
      >[0]['configManager'],
      spinner: spinner as unknown as ConstructorParameters<typeof DevSessionService>[0]['spinner'],
    });
    return { service, config, load };
  }
  function stopOnSignal(): void {
    const once = process.once.bind(process);
    vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGINT') {
        queueMicrotask(() => listener());
        return process;
      }
      if (event === 'SIGTERM') return process;
      return once(event, listener);
    });
  }

  it('passes forwarding options and saves only nonsensitive forwarding state', async () => {
    const { service, config } = createService();
    stopOnSignal();
    await service.run({
      port: '4000',
      forwardTo: 'http://localhost:3000/hooks?token=private-query',
      forwardTimeout: '5000',
    });
    expect(mocks.constructServer).toHaveBeenCalledWith(4000, config, {
      forwardTo: 'http://localhost:3000/hooks?token=private-query',
      forwardTimeoutMs: 5000,
    });
    expect(mocks.saveState).toHaveBeenCalledWith(
      expect.objectContaining({ forwardingEnabled: true, forwardTimeoutMs: 5000 })
    );
    expect(JSON.stringify(mocks.saveState.mock.calls)).not.toContain('private-query');
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-query');
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it.each([
    { forwardTo: 'http://localhost:4000/webhook/project' },
    { forwardTo: 'http://example.com/hooks' },
    { forwardTo: 'https://user:private-password@example.com/hooks' },
    { forwardTimeout: '100abc' },
    { forwardTimeout: '0' },
    { port: '4000abc' },
    { port: '65536' },
  ])('rejects invalid listener/forwarding settings before tunnel startup', async (options) => {
    const { service, load } = createService();
    await expect(service.run({ port: '4000', ...options })).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
    expect(mocks.forward).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.clearState).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-password');
  });

  it('rejects an external tunnel loop and closes the new tunnel', async () => {
    const { service } = createService();
    await expect(
      service.run({ port: '4000', forwardTo: 'https://example.ngrok.app/webhook/project' })
    ).rejects.toThrow();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('cleans up the listener and tunnel after a startup failure', async () => {
    const { service } = createService();
    mocks.saveState.mockRejectedValueOnce(new Error('State write failed'));
    await expect(
      service.run({ port: '4000', forwardTo: 'http://localhost:3000/hooks' })
    ).rejects.toThrow();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.clearState).toHaveBeenCalledOnce();
  });

  it('stops the listener even if state/tunnel cleanup fails', async () => {
    const { service } = createService();
    stopOnSignal();
    mocks.close.mockRejectedValueOnce(new Error('Tunnel close failed'));
    mocks.clearState.mockRejectedValueOnce(new Error('State cleanup failed'));
    await service.run({ port: '4000', forwardTo: 'http://localhost:3000/hooks' });
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.clearState).toHaveBeenCalledOnce();
  });

  it.each([
    false,
    true,
  ])('preserves tracked webhooks/secrets when registration is disabled, CLI flag=%s', async (cliFlag) => {
    const { service, config } = createService();
    config.dev.autoRegisterWebhook = cliFlag;
    config.registeredWebhooks = [
      { id: 'hook_existing', url: 'https://example.com/webhook', createdAt: 1700000000 },
    ];
    config.webhookSecrets = { hook_existing: 'fixture-existing-secret' };
    stopOnSignal();
    await service.run({ port: '4000', ...(cliFlag && { register: false }) });
    expect(mocks.createWebhook).not.toHaveBeenCalled();
    expect(mocks.disableWebhook).not.toHaveBeenCalled();
    expect(config.registeredWebhooks).toHaveLength(1);
    expect(config.webhookSecrets).toEqual({ hook_existing: 'fixture-existing-secret' });
  });

  it('persists secret_key for verification, then cleans up on shutdown', async () => {
    const config: PayMongoConfig = {
      version: '1.0',
      projectName: 'contract-test',
      environment: 'test',
      apiKeys: { test: { public: '', secret: 'sk_test_example' } },
      webhooks: { url: '', events: ['payment.paid'] },
      webhookSecrets: {},
      dev: { port: 3000, autoRegisterWebhook: true, verifyWebhookSignatures: true },
    };
    const savedSecrets: Record<string, string>[] = [];
    const configManager = {
      load: async () => config,
      save: async () => {
        savedSecrets.push({ ...config.webhookSecrets });
      },
    };
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      stop: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
    };
    const service = new DevSessionService({
      configManager: configManager as unknown as ConstructorParameters<
        typeof DevSessionService
      >[0]['configManager'],
      spinner: spinner as unknown as ConstructorParameters<typeof DevSessionService>[0]['spinner'],
    });

    const once = process.once.bind(process);
    vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGINT') {
        queueMicrotask(() => listener());
        return process;
      }
      if (event === 'SIGTERM') return process;
      return once(event, listener);
    });

    await service.run({ port: '3000', ngrokToken: 'test-token' });

    expect(mocks.createWebhook).toHaveBeenCalledWith(
      'https://example.ngrok.app/webhook/contract-test',
      ['payment.paid', 'payment.failed']
    );
    expect(savedSecrets[0]).toEqual({ hook_123: 'whsk_contract_secret' });
    expect(mocks.disableWebhook).toHaveBeenCalledWith('hook_123');
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('whsk_contract_secret'));
  });
});
