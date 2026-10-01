import fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebhookEventPayload } from '../types/paymongo.js';

export interface StoredWebhookEvent {
  id: string;
  event: string;
  url: string;
  payload: WebhookEventPayload;
  timestamp: number;
  status: 'delivered' | 'failed';
  response?: Record<string, unknown>;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredEvent(value: unknown): value is StoredWebhookEvent {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.event === 'string' &&
    typeof value.url === 'string' &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    (value.status === 'delivered' || value.status === 'failed') &&
    isRecord(value.payload) &&
    isRecord(value.payload.data) &&
    typeof value.payload.data.id === 'string' &&
    typeof value.payload.data.type === 'string' &&
    isRecord(value.payload.data.attributes) &&
    (value.response === undefined || isRecord(value.response)) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

class WebhookEventStore {
  private storePath: string;
  private storeDir: string;

  constructor() {
    // Store webhook events in user's home directory
    this.storeDir = path.join(os.homedir(), '.paymongo');
    this.storePath = path.join(this.storeDir, 'webhook-events.json');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true, mode: 0o700 });
  }

  async storeEvent(event: StoredWebhookEvent): Promise<void> {
    try {
      await this.ensureDir();
      const events = await this.loadEvents();
      events.push(event);

      // Keep only last 1000 events to prevent file from growing too large
      if (events.length > 1000) {
        events.splice(0, events.length - 1000);
      }

      await fs.writeFile(this.storePath, JSON.stringify(events, null, 2), { mode: 0o600 });
    } catch (error) {
      // Silently fail if we can't store events
      console.warn('Failed to store webhook event:', error);
    }
  }

  async loadEvents(): Promise<StoredWebhookEvent[]> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      const parsed: unknown = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.filter(isStoredEvent) : [];
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      return [];
    }
  }

  async getEventById(id: string): Promise<StoredWebhookEvent | null> {
    const events = await this.loadEvents();
    return events.find((event) => event.id === id) || null;
  }

  async getEventsByType(eventType: string, limit: number = 10): Promise<StoredWebhookEvent[]> {
    if (!Number.isInteger(limit) || limit <= 0) return [];
    const events = await this.loadEvents();
    return events.filter((event) => event.event === eventType).slice(-limit); // Get most recent events
  }

  async clearEvents(): Promise<void> {
    try {
      await fs.unlink(this.storePath);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return;
      }
      console.warn('Failed to clear webhook events:', error);
    }
  }
}

export default WebhookEventStore;
