import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayMongoConfig } from '../../src/types/paymongo.js';
import { testConfig } from '../fixtures/config.js';

const m = vi.hoisted(() => ({
  load: vi.fn<() => Promise<PayMongoConfig | null>>(),
  write: vi.fn(),
  input: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ default: { writeFile: m.write } }));
vi.mock('@inquirer/prompts', () => ({ input: m.input }));
vi.mock('../../src/services/config/manager.js', () => ({
  default: vi.fn().mockImplementation(() => ({ load: m.load })),
}));
vi.mock('../../src/utils/spinner.js', () => ({ default: vi.fn().mockImplementation(() => m) }));

describe('Generate commands execute real templates with isolated output', () => {
  let command: Command;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    m.load.mockReset().mockResolvedValue(testConfig());
    m.write.mockReset().mockResolvedValue(undefined);
    m.input.mockReset().mockResolvedValue('fixture-output.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    command = (await import('../../src/commands/generate.js')).default;
    command.exitOverride();
  });
  afterEach(() => vi.restoreAllMocks());
  const run = (args: string[]) => command.parseAsync(args, { from: 'user' });
  it.each([
    'javascript',
    'typescript',
  ])('writes a %s webhook handler preserving raw-body verification', async (language) => {
    await run([
      'webhook-handler',
      '--events',
      'payment.paid, payment.failed',
      '--language',
      language,
      '--framework',
      'express',
      '--output',
      'handler.txt',
    ]);
    expect(m.input).not.toHaveBeenCalled();
    expect(m.write).toHaveBeenCalledWith(
      'handler.txt',
      expect.stringContaining('createHmac'),
      'utf-8'
    );
    expect(m.write.mock.calls[0]?.[1]).toContain('payment.paid');
    expect(m.succeed).toHaveBeenCalledWith('Webhook handler generated: handler.txt');
  });
  it('prompts for events and a default JS output name', async () => {
    m.input
      .mockResolvedValueOnce('payment.paid, payment.failed')
      .mockResolvedValueOnce('handler.js');
    await run(['webhook-handler']);
    expect(m.input).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ default: 'payment.paid,payment.failed' })
    );
    expect(m.input).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ default: 'webhook-handler-payment-paid.js' })
    );
    expect(m.write).toHaveBeenCalledWith('handler.js', expect.any(String), 'utf-8');
  });
  it('uses the TS default filename and warns on unknown events without pretending they are supported', async () => {
    await run(['webhook-handler', '--events', 'unknown.event', '--language', 'typescript']);
    expect(m.input).toHaveBeenCalledWith(
      expect.objectContaining({ default: 'webhook-handler-unknown-event.ts' })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unknown events'));
  });
  it('handles an empty prompted event list with the fallback filename', async () => {
    m.input.mockResolvedValueOnce('').mockResolvedValueOnce('fallback.js');
    await run(['webhook-handler']);
    expect(m.input).toHaveBeenLastCalledWith(
      expect.objectContaining({ default: 'webhook-handler-webhook.js' })
    );
  });
  it('does not prompt or write when project configuration is missing', async () => {
    m.load.mockResolvedValue(null);
    await run(['webhook-handler']);
    expect(m.fail).toHaveBeenCalledWith('No configuration found');
    expect(m.write).not.toHaveBeenCalled();
    expect(m.input).not.toHaveBeenCalled();
  });
  it.each([
    'javascript',
    'typescript',
  ])('generates %s payment-intent code with selected methods', async (language) => {
    await run([
      'payment-intent',
      '--language',
      language,
      '--methods',
      'card, gcash',
      '--output',
      'intent.txt',
    ]);
    expect(m.write).toHaveBeenCalledWith(
      'intent.txt',
      expect.stringContaining('payment_method_allowed'),
      'utf-8'
    );
    expect(m.write.mock.calls[0]?.[1]).toContain('gcash');
    expect(m.input).not.toHaveBeenCalled();
  });
  it.each([
    'javascript',
    'typescript',
  ])('prompts with the %s intent extension and default methods', async (language) => {
    await run(['payment-intent', '--language', language]);
    expect(m.input).toHaveBeenCalledWith(
      expect.objectContaining({
        default: `create-payment-intent.${language === 'typescript' ? 'ts' : 'js'}`,
      })
    );
    expect(m.write.mock.calls[0]?.[1]).toContain('paymaya');
  });
  it.each([
    ['html', 'html'],
    ['react', 'jsx'],
    ['vue', 'vue'],
  ])('generates a %s checkout page with its suggested extension', async (language, extension) => {
    await run(['checkout-page', '--language', language]);
    expect(m.input).toHaveBeenCalledWith(
      expect.objectContaining({ default: `checkout.${extension}` })
    );
    expect(m.write).toHaveBeenCalledWith('fixture-output.js', expect.any(String), 'utf-8');
    expect(m.succeed).toHaveBeenCalledWith('Checkout page generated: fixture-output.js');
  });
  it('honors explicit checkout output without prompting', async () => {
    await run(['checkout-page', '--output', 'page.html']);
    expect(m.input).not.toHaveBeenCalled();
    expect(m.write).toHaveBeenCalledWith('page.html', expect.any(String), 'utf-8');
  });
  it.each([
    'webhook-handler',
    'payment-intent',
    'checkout-page',
  ])('does not report successful %s generation after an output failure', async (subcommand) => {
    m.write.mockRejectedValue(new Error('Fixture write failure'));
    await expect(run([subcommand, '--output', 'fixture.txt'])).rejects.toMatchObject({
      name: 'CommandError',
    });
    expect(m.fail).toHaveBeenCalledWith('Generation failed');
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'Fixture write failure');
    expect(m.succeed.mock.calls.map((call) => call[0]).join(' ')).not.toContain('generated:');
  });
  it.each([
    'webhook-handler',
    'payment-intent',
    'checkout-page',
  ])('handles a non-Error %s failure without falsely reporting success', async (subcommand) => {
    m.write.mockRejectedValue('Fixture failure');
    await expect(run([subcommand, '--output', 'fixture.txt'])).rejects.toMatchObject({
      name: 'CommandError',
    });
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'Fixture failure');
    expect(m.fail).toHaveBeenCalledWith('Generation failed');
  });
});
