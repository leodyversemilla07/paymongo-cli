import { describe, expect, it } from 'vitest';
import {
  validateForwardTarget,
  validateForwardTimeout,
  WebhookForwarder,
} from '../../src/services/dev/forwarder.js';
import { NetworkError, ValidationError } from '../../src/utils/errors.js';

describe('Webhook forwarding safeguards', () => {
  it.each([
    'http://localhost:3000/hooks',
    'http://127.0.0.1:3000/hooks',
    'http://[::1]:3000/hooks',
    'https://example.com/hooks',
  ])('accepts explicit loopback HTTP or HTTPS destinations: %s', (target) => {
    expect(validateForwardTarget(target).href).toBe(new URL(target).href);
  });
  it.each([
    'not-a-url',
    'file:///private/file',
    'ftp://example.com/hook',
    'http://example.com/hook',
    'http://192.168.1.2/hook',
    'https://user:private-password@example.com/hook',
    'https://example.com/hook#fragment',
  ])('rejects unsafe targets without echoing supplied values: %s', (target) => {
    expect(() => validateForwardTarget(target)).toThrow(ValidationError);
    try {
      validateForwardTarget(target);
    } catch (error) {
      expect((error as Error).message).not.toContain('private-password');
    }
  });
  it.each([
    ['http://localhost:4000/webhook/project', 4000, undefined],
    ['http://127.0.0.1:4000/webhook', 4000, undefined],
    ['https://example.ngrok.app/webhook/project', 4000, 'https://example.ngrok.app'],
  ])('rejects direct listener/tunnel loops', (target, port, tunnel) => {
    expect(() => validateForwardTarget(target, port, tunnel)).toThrow('cannot point back');
  });
  it('allows a different application port and preserves query routing', () => {
    expect(validateForwardTarget('http://localhost:3000/hooks?route=order', 4000).search).toBe(
      '?route=order'
    );
  });
  it.each([
    0,
    -1,
    1.5,
    30001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid timeout %s', (timeout) => {
    expect(() => validateForwardTimeout(timeout)).toThrow(ValidationError);
  });
  it.each([1, 10000, 30000])('accepts timeout boundary %s', (timeout) => {
    expect(validateForwardTimeout(timeout)).toBe(timeout);
  });
  it('closes idempotently and rejects delivery after shutdown', async () => {
    const forwarder = new WebhookForwarder('http://localhost:3000/hooks');
    forwarder.close();
    forwarder.close();
    await expect(forwarder.forward(Buffer.from('{}'), {})).rejects.toThrow(NetworkError);
  });
});
