import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size in MB
}

export class Cache {
  private cacheDir: string;
  private options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 10, // 10MB default
    };

    // Create cache directory in user's home
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    this.cacheDir = path.join(homeDir, '.paymongo-cli', 'cache');

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCacheKey(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  private getCachePath(key: string): string {
    return path.join(this.cacheDir, this.getCacheKey(key) + '.json');
  }

  private isExpired(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      const age = Date.now() - stats.mtime.getTime();
      return age > this.options.ttl;
    } catch {
      return true;
    }
  }

  private getCacheSize(): number {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }

      return totalSize / (1024 * 1024); // MB
    } catch {
      return 0;
    }
  }

  private cleanup(): void {
    try {
      const files = fs
        .readdirSync(this.cacheDir)
        .map((file) => ({
          name: file,
          path: path.join(this.cacheDir, file),
          stats: fs.statSync(path.join(this.cacheDir, file)),
        }))
        .sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());

      // Remove oldest files if cache is too large
      let currentSize = this.getCacheSize();
      for (const file of files) {
        if (currentSize <= this.options.maxSize * 0.8) break; // Keep 80% of max size

        fs.unlinkSync(file.path);
        currentSize -= file.stats.size / (1024 * 1024);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const cachePath = this.getCachePath(key);

    try {
      if (!fs.existsSync(cachePath) || this.isExpired(cachePath)) {
        return null;
      }

      const data = fs.readFileSync(cachePath, 'utf-8');
      const cached = JSON.parse(data);

      return cached.data;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    const cachePath = this.getCachePath(key);

    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
      };

      fs.writeFileSync(cachePath, JSON.stringify(cacheData));

      // Cleanup if cache is getting too large
      if (this.getCacheSize() > this.options.maxSize) {
        this.cleanup();
      }
    } catch {
      // Ignore cache write errors
    }
  }

  async clear(): Promise<void> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    } catch {
      // Ignore clear errors
    }
  }

  async invalidate(key: string): Promise<void> {
    const cachePath = this.getCachePath(key);

    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch {
      // Ignore delete errors
    }
  }
}

export default Cache;
