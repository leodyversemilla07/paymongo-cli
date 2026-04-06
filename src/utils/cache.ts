import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size in MB
}

interface FileInfo {
  name: string;
  path: string;
  mtime: number;
  size: number;
}

export class Cache {
  private cacheDir: string;
  private options: Required<CacheOptions>;
  private initialized: Promise<void>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 10, // 10MB default
    };

    // Create cache directory in user's home - use os.homedir() as primary
    const homeDirectory = process.env.HOME || process.env.USERPROFILE || homedir();
    this.cacheDir = path.join(homeDirectory, '.paymongo-cli', 'cache');

    // Initialize cache directory asynchronously
    this.initialized = this.initCacheDir();
  }

  private async initCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // Directory might already exist or creation failed
    }
  }

  private getCacheKey(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  private getCachePath(key: string): string {
    return path.join(this.cacheDir, `${this.getCacheKey(key)}.json`);
  }

  private async isExpired(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtime.getTime();
      return age > this.options.ttl;
    } catch {
      return true;
    }
  }

  private async getCacheSize(): Promise<number> {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      return totalSize / (1024 * 1024); // MB
    } catch {
      return 0;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const fileNames = await fs.readdir(this.cacheDir);
      const files: FileInfo[] = [];

      for (const file of fileNames) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        files.push({
          name: file,
          path: filePath,
          mtime: stats.mtime.getTime(),
          size: stats.size,
        });
      }

      // Sort by modification time (oldest first)
      files.sort((a, b) => a.mtime - b.mtime);

      // Remove oldest files if cache is too large
      let currentSize = await this.getCacheSize();
      for (const file of files) {
        if (currentSize <= this.options.maxSize * 0.8) {
          break;
        } // Keep 80% of max size

        await fs.unlink(file.path);
        currentSize -= file.size / (1024 * 1024);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.initialized;
    const cachePath = this.getCachePath(key);

    try {
      // Check if file exists
      try {
        await fs.access(cachePath);
      } catch {
        return null;
      }

      if (await this.isExpired(cachePath)) {
        return null;
      }

      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);

      return cached.data;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    await this.initialized;
    const cachePath = this.getCachePath(key);

    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
      };

      await fs.writeFile(cachePath, JSON.stringify(cacheData));

      // Cleanup if cache is getting too large
      const currentSize = await this.getCacheSize();
      if (currentSize > this.options.maxSize) {
        await this.cleanup();
      }
    } catch {
      // Ignore cache write errors
    }
  }

  async clear(): Promise<void> {
    await this.initialized;
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(files.map((file) => fs.unlink(path.join(this.cacheDir, file))));
    } catch {
      // Ignore clear errors
    }
  }

  async invalidate(key: string): Promise<void> {
    await this.initialized;
    const cachePath = this.getCachePath(key);

    try {
      await fs.unlink(cachePath);
    } catch {
      // Ignore delete errors (file might not exist)
    }
  }
}

export default Cache;
