import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebhookEventPayload } from '../types/paymongo.js';

export interface StoredWebhookEvent {
  id: string;
  event: string;
  url: string;
  payload: WebhookEventPayload;
  timestamp: number;
  status: 'delivered' | 'failed';
  response?: any;
  error?: string;
}

class WebhookEventStore {
  private storePath: string;

  constructor() {
    // Store webhook events in user's home directory
    const paymongoDir = path.join(os.homedir(), '.paymongo');
    this.storePath = path.join(paymongoDir, 'webhook-events.json');

    // Ensure directory exists
    if (!fs.existsSync(paymongoDir)) {
      fs.mkdirSync(paymongoDir, { recursive: true });
    }
  }

  async storeEvent(event: StoredWebhookEvent): Promise<void> {
    try {
      const events = await this.loadEvents();
      events.push(event);

      // Keep only last 1000 events to prevent file from growing too large
      if (events.length > 1000) {
        events.splice(0, events.length - 1000);
      }

      fs.writeFileSync(this.storePath, JSON.stringify(events, null, 2));
    } catch (error) {
      // Silently fail if we can't store events
      console.warn('Failed to store webhook event:', error);
    }
  }

  async loadEvents(): Promise<StoredWebhookEvent[]> {
    try {
      if (!fs.existsSync(this.storePath)) {
        return [];
      }
      const data = fs.readFileSync(this.storePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async getEventById(id: string): Promise<StoredWebhookEvent | null> {
    const events = await this.loadEvents();
    return events.find((event) => event.id === id) || null;
  }

  async getEventsByType(eventType: string, limit: number = 10): Promise<StoredWebhookEvent[]> {
    const events = await this.loadEvents();
    return events.filter((event) => event.event === eventType).slice(-limit); // Get most recent events
  }

  async clearEvents(): Promise<void> {
    try {
      if (fs.existsSync(this.storePath)) {
        fs.unlinkSync(this.storePath);
      }
    } catch (error) {
      console.warn('Failed to clear webhook events:', error);
    }
  }
}

export default WebhookEventStore;
