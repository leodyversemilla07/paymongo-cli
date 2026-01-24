import fs from 'fs';
import path from 'path';
import Logger from '../../utils/logger.js';

export interface WebhookEventData {
  type?: string;
  amount?: number;
  status?: string;
  [key: string]: unknown;
}

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: number;
  success: boolean;
  error?: string;
  responseTime?: number;
  data?: WebhookEventData;
}

export interface AnalyticsData {
  totalEvents: number;
  successRate: number;
  eventsByType: Record<string, number>;
  recentEvents: WebhookEvent[];
  averageResponseTime: number;
  errorsByType: Record<string, number>;
}

export class AnalyticsService {
  private events: WebhookEvent[] = [];
  private dataFile: string;
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.dataFile = path.join(process.cwd(), '.paymongo', 'analytics.json');
    this.loadEvents();
  }

  private loadEvents(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
        this.events = data.events || [];
        // Keep only last 1000 events
        if (this.events.length > 1000) {
          this.events = this.events.slice(-1000);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load analytics data', error as Error);
      this.events = [];
    }
  }

  private saveEvents(): void {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataFile, JSON.stringify({ events: this.events }, null, 2));
    } catch (error) {
      this.logger.error('Failed to save analytics data', error as Error);
    }
  }

  public recordEvent(event: Omit<WebhookEvent, 'id' | 'timestamp'>): void {
    const webhookEvent: WebhookEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    this.events.push(webhookEvent);

    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }

    this.saveEvents();
  }

  public getAnalytics(): AnalyticsData {
    const totalEvents = this.events.length;
    const successfulEvents = this.events.filter((e) => e.success).length;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;

    const eventsByType: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    this.events.forEach((event) => {
      // Count events by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;

      // Count errors by type
      if (!event.success && event.error) {
        errorsByType[event.type] = (errorsByType[event.type] || 0) + 1;
      }

      // Calculate average response time
      if (event.responseTime !== undefined) {
        totalResponseTime += event.responseTime;
        responseTimeCount++;
      }
    });

    const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;

    // Get recent events (last 50)
    const recentEvents = this.events.slice(-50).reverse();

    return {
      totalEvents,
      successRate: Math.round(successRate * 100) / 100,
      eventsByType,
      recentEvents,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      errorsByType,
    };
  }

  public clearAnalytics(): void {
    this.events = [];
    this.saveEvents();
  }
}
