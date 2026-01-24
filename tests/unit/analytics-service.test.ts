import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AnalyticsService, WebhookEvent, AnalyticsData } from '../../src/services/analytics/service';

describe('AnalyticsService', () => {
  let tempDir: string;
  let analyticsService: AnalyticsService;
  let originalCwd: string;

  beforeEach(() => {
    // Store original cwd
    originalCwd = process.cwd();

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-analytics-test-'));

    // Change to temp directory
    process.chdir(tempDir);

    // Create .paymongo directory
    const paymongoDir = path.join(tempDir, '.paymongo');
    if (!fs.existsSync(paymongoDir)) {
      fs.mkdirSync(paymongoDir, { recursive: true });
    }

    // Create analytics service instance
    analyticsService = new AnalyticsService();
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('recordEvent', () => {
    it('should record a successful webhook event', () => {
      analyticsService.recordEvent({
        type: 'payment.paid',
        success: true,
        responseTime: 150,
        data: { amount: 10000 },
      });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.totalEvents).toBe(1);
      expect(analytics.successRate).toBe(100);
    });

    it('should record a failed webhook event', () => {
      analyticsService.recordEvent({
        type: 'payment.failed',
        success: false,
        error: 'Connection timeout',
        responseTime: 5000,
      });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.totalEvents).toBe(1);
      expect(analytics.successRate).toBe(0);
      expect(analytics.errorsByType['payment.failed']).toBe(1);
    });

    it('should generate unique event IDs', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.paid', success: true });

      const analytics = analyticsService.getAnalytics();
      const eventIds = analytics.recentEvents.map((e) => e.id);
      expect(new Set(eventIds).size).toBe(2); // All IDs should be unique
    });

    it('should include timestamp in recorded events', () => {
      const beforeTime = Date.now();
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      const afterTime = Date.now();

      const analytics = analyticsService.getAnalytics();
      const event = analytics.recentEvents[0];
      expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(event.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getAnalytics', () => {
    it('should return empty analytics when no events recorded', () => {
      const analytics = analyticsService.getAnalytics();

      expect(analytics.totalEvents).toBe(0);
      expect(analytics.successRate).toBe(0);
      expect(analytics.averageResponseTime).toBe(0);
      expect(analytics.recentEvents).toEqual([]);
      expect(analytics.eventsByType).toEqual({});
      expect(analytics.errorsByType).toEqual({});
    });

    it('should calculate correct success rate', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.failed', success: false, error: 'Error' });
      analyticsService.recordEvent({ type: 'payment.paid', success: true });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.successRate).toBe(75); // 3 out of 4
    });

    it('should count events by type', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.failed', success: false, error: 'Error' });
      analyticsService.recordEvent({ type: 'source.chargeable', success: true });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.eventsByType['payment.paid']).toBe(2);
      expect(analytics.eventsByType['payment.failed']).toBe(1);
      expect(analytics.eventsByType['source.chargeable']).toBe(1);
    });

    it('should count errors by type', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: false, error: 'Error 1' });
      analyticsService.recordEvent({ type: 'payment.paid', success: false, error: 'Error 2' });
      analyticsService.recordEvent({ type: 'payment.failed', success: false, error: 'Error 3' });
      analyticsService.recordEvent({ type: 'payment.paid', success: true }); // Success - no error

      const analytics = analyticsService.getAnalytics();
      expect(analytics.errorsByType['payment.paid']).toBe(2);
      expect(analytics.errorsByType['payment.failed']).toBe(1);
    });

    it('should calculate average response time', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true, responseTime: 100 });
      analyticsService.recordEvent({ type: 'payment.paid', success: true, responseTime: 200 });
      analyticsService.recordEvent({ type: 'payment.paid', success: true, responseTime: 300 });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.averageResponseTime).toBe(200);
    });

    it('should return recent events in reverse chronological order', () => {
      analyticsService.recordEvent({ type: 'event1', success: true });
      analyticsService.recordEvent({ type: 'event2', success: true });
      analyticsService.recordEvent({ type: 'event3', success: true });

      const analytics = analyticsService.getAnalytics();
      expect(analytics.recentEvents[0].type).toBe('event3');
      expect(analytics.recentEvents[1].type).toBe('event2');
      expect(analytics.recentEvents[2].type).toBe('event1');
    });

    it('should limit recent events to last 50', () => {
      for (let i = 0; i < 60; i++) {
        analyticsService.recordEvent({ type: `event_${i}`, success: true });
      }

      const analytics = analyticsService.getAnalytics();
      expect(analytics.recentEvents.length).toBe(50);
    });
  });

  describe('clearAnalytics', () => {
    it('should clear all recorded events', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.paid', success: true });

      analyticsService.clearAnalytics();

      const analytics = analyticsService.getAnalytics();
      expect(analytics.totalEvents).toBe(0);
      expect(analytics.recentEvents).toEqual([]);
    });

    it('should persist cleared state to file', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.clearAnalytics();

      // Create new instance to verify persistence
      const newService = new AnalyticsService();
      const analytics = newService.getAnalytics();
      expect(analytics.totalEvents).toBe(0);
    });
  });

  describe('event limit', () => {
    it('should keep only last 1000 events', () => {
      // Record more than 1000 events
      for (let i = 0; i < 1050; i++) {
        analyticsService.recordEvent({ type: `event_${i}`, success: true });
      }

      const analytics = analyticsService.getAnalytics();
      expect(analytics.totalEvents).toBe(1000);
    });
  });

  describe('persistence', () => {
    it('should persist events to file', () => {
      analyticsService.recordEvent({ type: 'payment.paid', success: true });
      analyticsService.recordEvent({ type: 'payment.failed', success: false, error: 'Test error' });

      // Create new instance to verify persistence
      const newService = new AnalyticsService();
      const analytics = newService.getAnalytics();

      expect(analytics.totalEvents).toBe(2);
      expect(analytics.eventsByType['payment.paid']).toBe(1);
      expect(analytics.eventsByType['payment.failed']).toBe(1);
    });

    it('should handle corrupted analytics file gracefully', () => {
      const analyticsFile = path.join(tempDir, '.paymongo', 'analytics.json');
      fs.writeFileSync(analyticsFile, '{ invalid json }');

      // Should not throw, just use empty events
      const newService = new AnalyticsService();
      const analytics = newService.getAnalytics();
      expect(analytics.totalEvents).toBe(0);
    });

    it('should handle missing analytics file gracefully', () => {
      const analyticsFile = path.join(tempDir, '.paymongo', 'analytics.json');
      if (fs.existsSync(analyticsFile)) {
        fs.unlinkSync(analyticsFile);
      }

      const newService = new AnalyticsService();
      const analytics = newService.getAnalytics();
      expect(analytics.totalEvents).toBe(0);
    });
  });
});
