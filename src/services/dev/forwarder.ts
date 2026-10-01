import * as http from 'node:http';
import * as https from 'node:https';
import { NetworkError, ValidationError, withRetry } from '../../utils/errors.js';

export const FORWARDING_HOP_HEADER = 'x-paymongo-cli-forwarded';
export const DEFAULT_FORWARD_TIMEOUT_MS = 10000;

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname.replace(/\.$/, ''));
}

/** Validate a deliberate forwarding destination without exposing its URL in errors. */
export function validateForwardTarget(
  target: string,
  listenerPort?: number,
  tunnelUrl?: string
): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new ValidationError('Forward target must be a valid HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new ValidationError('Forward target must be HTTP(S) without credentials or a fragment');
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new ValidationError(
      'HTTP forwarding is only allowed to loopback hosts; use HTTPS elsewhere'
    );
  }
  const pointsToListener =
    isLoopback(url.hostname) &&
    Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === listenerPort;
  const pointsToTunnel = tunnelUrl !== undefined && url.origin === new URL(tunnelUrl).origin;
  if ((pointsToListener || pointsToTunnel) && url.pathname.startsWith('/webhook')) {
    throw new ValidationError('Forward target cannot point back to the CLI webhook listener');
  }
  return url;
}

export function validateForwardTimeout(timeout: number): number {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) {
    throw new ValidationError(
      'Forward timeout must be an integer between 1 and 30000 milliseconds'
    );
  }
  return timeout;
}

export interface ForwardingResult {
  statusCode: number;
  durationMs: number;
}

/** One-hop, non-retrying delivery of the original webhook bytes and signature. */
export class WebhookForwarder {
  private readonly target: URL;
  private readonly timeoutMs: number;
  private readonly agent: http.Agent | https.Agent;
  private readonly active = new Set<AbortController>();
  private closed = false;

  constructor(target: string, timeoutMs = DEFAULT_FORWARD_TIMEOUT_MS) {
    this.target = validateForwardTarget(target);
    this.timeoutMs = validateForwardTimeout(timeoutMs);
    this.agent =
      this.target.protocol === 'https:'
        ? new https.Agent({ keepAlive: true, maxSockets: 10 })
        : new http.Agent({ keepAlive: true, maxSockets: 10 });
  }

  async forward(
    body: Buffer,
    incomingHeaders: http.IncomingHttpHeaders
  ): Promise<ForwardingResult> {
    if (this.closed) throw new NetworkError('Application forwarding stopped');
    return withRetry(
      async () => {
        const started = performance.now();
        const controller = new AbortController();
        this.active.add(controller);
        const timer = setTimeout(
          () => controller.abort(new NetworkError('Application forwarding timed out')),
          this.timeoutMs
        );
        const headers: Record<string, string> = {
          'content-type':
            typeof incomingHeaders['content-type'] === 'string'
              ? incomingHeaders['content-type']
              : 'application/json',
          'content-length': String(body.length),
          [FORWARDING_HOP_HEADER]: '1',
        };
        const signature = incomingHeaders['paymongo-signature'];
        if (typeof signature === 'string') headers['paymongo-signature'] = signature;
        try {
          const statusCode = await new Promise<number>((resolve, reject) => {
            const failure = () =>
              reject(
                controller.signal.reason instanceof NetworkError
                  ? controller.signal.reason
                  : new NetworkError('Application forwarding failed')
              );
            const request = (this.target.protocol === 'https:' ? https.request : http.request)(
              this.target,
              {
                method: 'POST',
                agent: this.agent,
                headers,
                signal: controller.signal,
              },
              (response) => {
                response.once('error', failure);
                response.once('end', () => resolve(response.statusCode ?? 502));
                response.resume(); // Discard response bodies; never log application data.
              }
            );
            request.once('error', failure);
            request.end(body);
          });
          return { statusCode, durationMs: Math.round(performance.now() - started) };
        } finally {
          clearTimeout(timer);
          this.active.delete(controller);
        }
      },
      { maxRetries: 0, silent: true }
    );
  }

  /** Abort outstanding deliveries and release all forwarding sockets. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.active)
      controller.abort(new NetworkError('Application forwarding stopped'));
    this.agent.destroy();
  }
}
