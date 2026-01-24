import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { ConfigManager } from '../config/manager';
import { ApiClient } from '../api/client';
import { AnalyticsService } from '../analytics/service';
import Logger from '../../utils/logger';

export interface WebServerOptions {
  port: number;
  host?: string;
  configManager: ConfigManager;
  apiClient: ApiClient;
  analyticsService: AnalyticsService;
}

export class WebServer {
  private app: express.Application;
  private server: HttpServer;
  private io: SocketServer;
  private configManager: ConfigManager;
  private apiClient: ApiClient;
  private analyticsService: AnalyticsService;
  private logger: Logger;
  private port: number;
  private host: string;

  constructor(options: WebServerOptions) {
    this.port = options.port;
    this.host = options.host || 'localhost';
    this.configManager = options.configManager;
    this.apiClient = options.apiClient;
    this.analyticsService = options.analyticsService;
    this.logger = new Logger();

    this.app = express();
    this.server = new HttpServer(this.app);
    this.io = new SocketServer(this.server);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    // Serve static files from web directory
    this.app.use(express.static(path.join(__dirname, '../../../web')));

    // Parse JSON bodies
    this.app.use(express.json());

    // CORS for local development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // API routes for frontend
    this.app.get('/api/config', async (_req, res) => {
      try {
        const config = await this.configManager.load();
        res.json({ success: true, data: config });
      } catch (error) {
        this.logger.error('Failed to load config for web API', error as Error);
        res.status(500).json({ success: false, error: 'Failed to load configuration' });
      }
    });

    this.app.put('/api/config', async (req, res) => {
      try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
          return res.status(400).json({ success: false, error: 'Key and value are required' });
        }

        const config = await this.configManager.load();
        if (!config) {
          return res.status(404).json({ success: false, error: 'Configuration not found' });
        }

        // Set the configuration value
        const keys = key.split('.');
        let current: any = config;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        await this.configManager.save(config);

        // Notify connected clients
        this.io.emit('config:updated', { key, value });

        res.json({ success: true });
        return;
      } catch (error) {
        this.logger.error('Failed to update config via web API', error as Error);
        res.status(500).json({ success: false, error: 'Failed to update configuration' });
        return;
      }
    });

    this.app.get('/api/webhooks', async (_req, res) => {
      try {
        const webhooks = await this.apiClient.listWebhooks();
        res.json({ success: true, data: webhooks });
      } catch (error) {
        this.logger.error('Failed to fetch webhooks for web API', error as Error);
        res.status(500).json({ success: false, error: 'Failed to fetch webhooks' });
      }
    });

    this.app.get('/api/analytics', (_req, res) => {
      try {
        const analytics = this.analyticsService.getAnalytics();
        res.json({ success: true, data: analytics });
      } catch (error) {
        this.logger.error('Failed to fetch analytics for web API', error as Error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
      }
    });

    // Serve the main dashboard
    this.app.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../../web/index.html'));
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      this.logger.info(`Web client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        this.logger.info(`Web client disconnected: ${socket.id}`);
      });

      // Handle real-time webhook events (to be integrated with dev server)
      socket.on('webhook:event', (event) => {
        this.logger.info('Webhook event received via socket', event);
        // Forward to all connected clients
        socket.broadcast.emit('webhook:event', event);
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error?: Error) => {
        if (error) {
          this.logger.error('Failed to start web server', error);
          reject(error);
        } else {
          this.logger.info(`PayMongo GUI Dashboard running at http://${this.host}:${this.port}`);
          resolve();
        }
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close();
      this.server.close(() => {
        this.logger.info('Web server stopped');
        resolve();
      });
    });
  }

  public getPort(): number {
    return this.port;
  }

  public emitWebhookEvent(event: any): void {
    this.io.emit('webhook:event', event);
  }
}
