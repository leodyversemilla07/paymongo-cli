import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { ConfigManager } from '../config/manager.js';
import { ApiClient } from '../api/client.js';
import { AnalyticsService } from '../analytics/service.js';
import Logger from '../../utils/logger.js';
import { WebhookEventPayload } from '../../types/paymongo.js';

// ES module compatibility - __dirname is not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Rate limiting for API endpoints
    const apiLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute window
      max: 100, // limit each IP to 100 requests per window
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false, // Disable X-RateLimit-* headers
      message: { success: false, error: 'Too many requests, please try again later' },
    });

    // Apply rate limiting to API routes
    this.app.use('/api/', apiLimiter);

    // Stricter rate limit for config modifications
    const configWriteLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute window
      max: 20, // limit config writes to 20 per minute
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many configuration updates, please slow down' },
    });

    this.app.use('/api/config', (req, res, next) => {
      if (req.method === 'PUT' || req.method === 'POST') {
        configWriteLimiter(req, res, next);
      } else {
        next();
      }
    });

    // CORS for local development - restricted to localhost origins
    const allowedOrigins = [
      `http://localhost:${this.port}`,
      `http://127.0.0.1:${this.port}`,
      `http://${this.host}:${this.port}`,
    ];
    
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }
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

        // Set the configuration value using type-safe nested access
        const keys = key.split('.');
        let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (k && !current[k]) {
            current[k] = {};
          }
          if (k) {
            current = current[k] as Record<string, unknown>;
          }
        }
        const lastKey = keys[keys.length - 1];
        if (lastKey) {
          current[lastKey] = value;
        }

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

  public emitWebhookEvent(event: WebhookEventPayload): void {
    this.io.emit('webhook:event', event);
  }
}
