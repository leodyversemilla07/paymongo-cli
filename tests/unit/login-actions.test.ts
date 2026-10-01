import crypto from 'node:crypto';
import path from 'node:path';
import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';
import { testConfig } from '../fixtures/config.js';

const m = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  unlink: vi.fn(),
  load: vi.fn<() => Promise<PayMongoConfig | null>>(),
  save: vi.fn(),
  delete: vi.fn(),
  defaults: vi.fn(),
  validate: vi.fn(),
  close: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('node:fs', () => ({
  existsSync: m.exists,
  mkdirSync: m.mkdir,
  writeFileSync: m.write,
  readFileSync: m.read,
  unlinkSync: m.unlink,
}));
vi.mock('node:os', () => ({
  homedir: () => '/fixture-home',
  hostname: () => 'fixture-host',
  userInfo: () => ({ username: 'fixture-user' }),
}));
vi.mock('../../src/services/config/manager.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    load: m.load,
    save: m.save,
    delete: m.delete,
    getDefaultConfig: m.defaults,
  })),
}));
vi.mock('../../src/services/api/client.js', () => ({
  default: vi.fn().mockImplementation(() => ({ validateApiKey: m.validate, close: m.close })),
}));
vi.mock('../../src/utils/spinner.js', () => ({ default: vi.fn().mockImplementation(() => m) }));
vi.mock('@inquirer/prompts', () => ({ select: m.select, password: m.password }));

const credentialPath = path.join('/fixture-home', '.paymongo', 'credentials.enc');
const saltPath = path.join('/fixture-home', '.paymongo', 'credentials.salt');
const secret = `sk_test_${'a'.repeat(32)}`;
const publicKey = `pk_test_${'b'.repeat(32)}`;
type EncryptedPayload = { v: number; iv: string; tag: string; data: string };
const output = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');

describe('Real login handler and encryption with entirely isolated storage/transport', () => {
  let command: Command;
  let CredentialManager: typeof import('../../src/commands/login.js').CredentialManager;
  let errors: typeof import('../../src/utils/errors.js');
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    m.files.clear();
    m.dirs.clear();
    m.exists
      .mockReset()
      .mockImplementation((value) => m.files.has(String(value)) || m.dirs.has(String(value)));
    m.mkdir.mockReset().mockImplementation((value) => {
      m.dirs.add(String(value));
    });
    m.write.mockReset().mockImplementation((value, data) => {
      m.files.set(String(value), String(data));
    });
    m.read.mockReset().mockImplementation((value) => {
      const data = m.files.get(String(value));
      if (data === undefined)
        throw Object.assign(new Error('Missing fixture file'), { code: 'ENOENT' });
      return data;
    });
    m.unlink.mockReset().mockImplementation((value) => {
      m.files.delete(String(value));
    });
    m.load.mockReset().mockResolvedValue(null);
    m.save.mockReset().mockResolvedValue(undefined);
    m.delete.mockReset().mockResolvedValue(undefined);
    m.defaults.mockReset().mockImplementation(() => testConfig());
    m.validate.mockReset().mockResolvedValue(true);
    m.close.mockReset().mockResolvedValue(undefined);
    m.select.mockReset().mockResolvedValue('test');
    m.password.mockReset().mockResolvedValueOnce(secret).mockResolvedValueOnce(publicKey);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const module = await import('../../src/commands/login.js');
    command = module.command;
    CredentialManager = module.CredentialManager;
    errors = await import('../../src/utils/errors.js');
    command.exitOverride();
  });
  afterEach(() => vi.restoreAllMocks());
  const run = (args: string[]) => command.parseAsync(args, { from: 'user' });
  const encrypted = () => JSON.parse(m.files.get(credentialPath) ?? '{}') as EncryptedPayload;

  it('round-trips actual AES-GCM credentials across independent managers using persisted salt', async () => {
    const credentials = { environment: 'test', secretKey: secret, publicKey };
    await new CredentialManager().saveCredentials(credentials);
    expect(m.mkdir).toHaveBeenCalledWith(path.dirname(credentialPath), {
      recursive: true,
      mode: 0o700,
    });
    expect(m.write).toHaveBeenCalledWith(saltPath, expect.stringMatching(/^[a-f0-9]{32}$/), {
      mode: 0o600,
    });
    expect(encrypted()).toMatchObject({
      v: 2,
      iv: expect.stringMatching(/^[a-f0-9]{24}$/),
      tag: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
    expect(m.files.get(credentialPath)).not.toContain(secret);
    expect(m.write).toHaveBeenCalledWith(credentialPath, expect.any(String), { mode: 0o600 });
    expect(await new CredentialManager().loadCredentials()).toEqual(credentials);
  });
  it('uses a fresh nonce when saving the same credentials again', async () => {
    const manager = new CredentialManager();
    await manager.saveCredentials({ environment: 'test', secretKey: secret });
    const first = encrypted().iv;
    await manager.saveCredentials({ environment: 'test', secretKey: secret });
    expect(encrypted().iv).not.toBe(first);
  });
  it('rejects authenticated ciphertext tampering without exposing contents', async () => {
    const manager = new CredentialManager();
    await manager.saveCredentials({ environment: 'test', secretKey: secret });
    const payload = encrypted();
    const bytes = Buffer.from(payload.tag, 'hex');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    payload.tag = bytes.toString('hex');
    m.files.set(credentialPath, JSON.stringify(payload));
    expect(await manager.loadCredentials()).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });
  it.each([
    '{broken',
    '{}',
    '{"v":2,"iv":"invalid","tag":"invalid","data":"invalid"}',
  ])('tolerates corrupt stored credentials', async (contents) => {
    m.files.set(credentialPath, contents);
    expect(await new CredentialManager().loadCredentials()).toBeNull();
  });
  it('returns null when credentials are absent', async () => {
    expect(await new CredentialManager().loadCredentials()).toBeNull();
  });
  it('migrates a genuine legacy CBC fixture to authenticated GCM', async () => {
    const legacyKey = crypto
      .createHash('sha256')
      .update('fixture-hostfixture-user')
      .digest('hex')
      .substring(0, 32);
    const iv = crypto.randomBytes(16);
    const credentials = { environment: 'test', secretKey: secret };
    const cipher = crypto.createCipheriv('aes-256-cbc', legacyKey, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]).toString('hex');
    m.files.set(credentialPath, JSON.stringify({ iv: iv.toString('hex'), data }));
    expect(await new CredentialManager().loadCredentials()).toEqual(credentials);
    expect(encrypted().v).toBe(2);
    expect(await new CredentialManager().loadCredentials()).toEqual(credentials);
  });
  it('fails closed when salt cannot be persisted instead of saving unrecoverable credentials', async () => {
    m.write.mockImplementation(() => {
      throw new Error('Fixture permission failure');
    });
    expect(() => new CredentialManager()).toThrow(errors.ConfigError);
    expect(m.files.has(credentialPath)).toBe(false);
  });
  it('fails closed on a salt read error without overwriting existing credentials', async () => {
    m.files.set(saltPath, 'ab'.repeat(16));
    m.files.set(credentialPath, 'preserve-existing-fixture');
    m.read.mockImplementation(() => {
      throw new Error('Fixture read failure');
    });
    expect(() => new CredentialManager()).toThrow(errors.ConfigError);
    expect(m.files.get(credentialPath)).toBe('preserve-existing-fixture');
    expect(m.write).not.toHaveBeenCalled();
  });
  it('clears credentials idempotently', async () => {
    const manager = new CredentialManager();
    m.files.set(credentialPath, 'fixture');
    await manager.clearCredentials();
    await manager.clearCredentials();
    expect(m.unlink).toHaveBeenCalledExactlyOnceWith(credentialPath);
  });
  it('non-interactive login validates, closes connections, saves encrypted credentials, and masks output', async () => {
    await run(['--key', secret, '--public-key', publicKey]);
    expect(m.validate).toHaveBeenCalledOnce();
    expect(m.close).toHaveBeenCalledOnce();
    expect(await new CredentialManager().loadCredentials()).toEqual({
      environment: 'test',
      secretKey: secret,
      publicKey,
    });
    expect(output()).toContain('Login Successful');
    expect(output()).not.toContain(secret);
    expect(output()).not.toContain(publicKey);
    expect(m.select).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('updates an existing project while preserving credentials for the other environment', async () => {
    const config = testConfig();
    config.apiKeys.live = { public: 'pk_live_fixture', secret: 'sk_live_fixture' };
    m.load.mockResolvedValue(config);
    await run(['--key', secret]);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeys: { test: { public: '', secret }, live: config.apiKeys.live },
      })
    );
    expect(await new CredentialManager().loadCredentials()).toEqual({
      environment: 'test',
      secretKey: secret,
    });
  });
  it('rebuilds invalid local config from defaults after successful authentication', async () => {
    m.load.mockRejectedValue(new Error('Invalid fixture config'));
    const config = testConfig();
    m.defaults.mockReturnValue(config);
    await run(['--key', secret]);
    expect(m.defaults).toHaveBeenCalledOnce();
    expect(m.save).toHaveBeenCalledWith(config);
  });
  it('initializes a legacy project without an apiKeys property', async () => {
    const config = testConfig();
    Reflect.deleteProperty(config, 'apiKeys');
    m.load.mockResolvedValue(config);
    await run(['--key', secret]);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeys: { test: { public: '', secret } } })
    );
  });
  it('exercises actual interactive key validators and stores prompted credentials', async () => {
    await run([]);
    const secretValidation = m.password.mock.calls[0]?.[0].validate as (
      value: string
    ) => true | string;
    const publicValidation = m.password.mock.calls[1]?.[0].validate as (
      value: string
    ) => true | string;
    expect(secretValidation('')).toBe('Secret API key is required');
    expect(secretValidation('bad')).toBe('Invalid secret API key format');
    expect(secretValidation(secret)).toBe(true);
    expect(publicValidation('')).toBe(true);
    expect(publicValidation('bad')).toBe('Invalid public API key format');
    expect(publicValidation(publicKey)).toBe(true);
    expect(m.validate).toHaveBeenCalledOnce();
    expect(m.close).toHaveBeenCalledOnce();
  });
  it('permits an omitted optional public key in interactive login', async () => {
    m.password.mockReset().mockResolvedValueOnce(secret).mockResolvedValueOnce('');
    await run([]);
    expect(await new CredentialManager().loadCredentials()).toEqual({
      environment: 'test',
      secretKey: secret,
    });
    expect(output()).not.toContain('Public Key:');
  });
  it('loads existing encrypted credentials before presenting interactive options', async () => {
    await new CredentialManager().saveCredentials({ environment: 'test', secretKey: secret });
    await run([]);
    expect(m.select).toHaveBeenCalledWith(expect.objectContaining({ default: 'test' }));
    expect(m.validate).toHaveBeenCalledOnce();
  });
  it('rejects an unsupported environment without API or filesystem activity', async () => {
    await expect(run(['--key', secret, '--env', 'production'])).rejects.toBeInstanceOf(
      errors.CommandError
    );
    expect(m.validate).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    ['test', `sk_live_${'a'.repeat(32)}`, undefined],
    ['live', secret, undefined],
    ['test', secret, `pk_live_${'b'.repeat(32)}`],
    ['test', 'invalid-secret', undefined],
    ['test', secret, 'invalid-public'],
  ])('rejects a mismatched or invalid credential set before API access', async (environment, key, publicValue) => {
    const args = ['--env', environment, '--key', key];
    if (publicValue) args.push('--public-key', publicValue);
    await expect(run(args)).rejects.toBeInstanceOf(errors.CommandError);
    expect(m.validate).not.toHaveBeenCalled();
    expect(m.files.has(credentialPath)).toBe(false);
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain(key);
  });
  it('enforces the selected mode for prompted keys as well', async () => {
    m.select.mockResolvedValue('live');
    await expect(run([])).rejects.toBeInstanceOf(errors.CommandError);
    expect(m.validate).not.toHaveBeenCalled();
  });
  it('supports explicitly requested live mode with synthetic matching credentials and mocked validation', async () => {
    const key = `sk_live_${'c'.repeat(32)}`;
    await run(['--env', 'live', '--key', key]);
    expect(await new CredentialManager().loadCredentials()).toEqual({
      environment: 'live',
      secretKey: key,
    });
    expect(m.validate).toHaveBeenCalledOnce();
    expect(m.close).toHaveBeenCalledOnce();
    expect(output()).not.toContain(key);
  });
  it('logs out while tolerating project config deletion failure', async () => {
    await new CredentialManager().saveCredentials({ environment: 'test', secretKey: secret });
    m.delete.mockRejectedValue(new Error('Fixture delete failure'));
    await run(['--logout']);
    expect(m.files.has(credentialPath)).toBe(false);
    expect(m.delete).toHaveBeenCalledOnce();
    expect(m.validate).not.toHaveBeenCalled();
    expect(output()).toContain('Successfully logged out');
  });
  it('logs out even when credentials were already absent', async () => {
    await run(['--logout']);
    expect(m.delete).toHaveBeenCalledOnce();
    expect(m.unlink).not.toHaveBeenCalled();
  });
  it.each([
    ['key', 'Invalid API key'],
    ['network', 'Network error'],
    ['server', 'API is currently unavailable'],
    ['rate', 'Too many requests'],
    ['api', 'API error'],
    ['unknown', 'Unexpected error during validation'],
  ])('handles %s validation failure and closes API connections without saving credentials', async (kind, expected) => {
    const error =
      kind === 'key'
        ? new errors.ApiKeyError('Fixture unauthorized')
        : kind === 'network'
          ? new errors.NetworkError('Fixture connection')
          : kind === 'server'
            ? new errors.PayMongoError('Fixture unavailable', 'API', 503)
            : kind === 'rate'
              ? new errors.PayMongoError('Fixture limited', 'RATE', 429)
              : kind === 'api'
                ? new errors.PayMongoError('Fixture API failure', 'API', 400)
                : new Error('Fixture failure');
    m.validate.mockRejectedValue(error);
    await expect(run(['--key', secret])).rejects.toBeInstanceOf(errors.CommandError);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.files.has(credentialPath)).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain(expected);
  });
  it('does not hide successful authentication behind cleanup failure', async () => {
    m.close.mockRejectedValue(new Error('Fixture close failure'));
    await run(['--key', secret]);
    expect(output()).toContain('Login Successful');
    expect(m.files.has(credentialPath)).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('could not release API connections')
    );
  });
  it.each([
    'API key failure',
    'Network connection failure',
    'permission denied',
    'other failure',
  ])('reports storage failure %s without a success message', async (message) => {
    m.write.mockImplementation((file, data) => {
      if (String(file) === credentialPath) throw new Error(message);
      m.files.set(String(file), String(data));
    });
    await expect(run(['--key', secret])).rejects.toBeInstanceOf(errors.CommandError);
    expect(output()).not.toContain('Login Successful');
    expect(m.stop).toHaveBeenCalled();
  });
  it('reports credential initialization failures through the command-level handler', async () => {
    m.mkdir.mockImplementation(() => {
      throw new Error('permission denied');
    });
    await expect(run(['--key', secret])).rejects.toBeInstanceOf(errors.CommandError);
    expect(m.validate).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalled();
  });
});
