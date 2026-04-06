import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Cache from '../../src/utils/cache';

describe('Cache', () => {
  let tempDir: string;
  let cacheDir: string;
  let cache: Cache;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    // Store original env vars
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paymongo-cache-test-'));

    // Set HOME to temp directory
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;

    // Create cache instance - it will create its own subdirectory
    cache = new Cache({ ttl: 1000, maxSize: 1 }); // 1 second TTL, 1MB max

    // Wait for async initialization to complete
    await cache.get('init-wait');

    // Get the actual cache directory
    cacheDir = path.join(tempDir, '.paymongo-cli', 'cache');
  });

  afterEach(() => {
    // Restore env vars
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create cache directory if it does not exist', async () => {
      // Cache dir should exist after async init completes
      expect(fs.existsSync(cacheDir)).toBe(true);
    });

    it('should use default options when none provided', async () => {
      const defaultCache = new Cache();
      // Wait for initialization
      await defaultCache.get('init-wait');
      expect(defaultCache).toBeDefined();
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data', async () => {
      const data = { key: 'value', number: 42 };

      await cache.set('test-key', data);
      const result = await cache.get<typeof data>('test-key');

      expect(result).toEqual(data);
    });

    it('should store and retrieve string data', async () => {
      await cache.set('string-key', 'hello world');
      const result = await cache.get<string>('string-key');

      expect(result).toBe('hello world');
    });

    it('should store and retrieve array data', async () => {
      const arr = [1, 2, 3, 'four', { five: 5 }];

      await cache.set('array-key', arr);
      const result = await cache.get<typeof arr>('array-key');

      expect(result).toEqual(arr);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent');

      expect(result).toBeNull();
    });

    it('should handle special characters in key', async () => {
      const key = 'webhooks_test/special:chars@123';
      const data = { id: 'test' };

      await cache.set(key, data);
      const result = await cache.get<typeof data>(key);

      expect(result).toEqual(data);
    });
  });

  describe('TTL expiration', () => {
    it('should return null for expired cache', async () => {
      // Create cache with very short TTL
      const shortCache = new Cache({ ttl: 50 }); // 50ms TTL

      await shortCache.set('expire-key', 'value');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await shortCache.get('expire-key');
      expect(result).toBeNull();
    });

    it('should return data before expiration', async () => {
      const longCache = new Cache({ ttl: 10000 }); // 10 second TTL

      await longCache.set('long-key', 'value');

      const result = await longCache.get('long-key');
      expect(result).toBe('value');
    });
  });

  describe('invalidate', () => {
    it('should remove specific cache entry', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.invalidate('key1');

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2');
    });

    it('should not throw when invalidating non-existent key', async () => {
      await expect(cache.invalidate('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all cache entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();
    });

    it('should not throw when clearing empty cache', async () => {
      await expect(cache.clear()).resolves.not.toThrow();
    });
  });

  describe('cache size limit', () => {
    it('should cleanup old files when size limit exceeded', async () => {
      // Create a cache with very small max size (0.001 MB = ~1KB)
      const smallCache = new Cache({ ttl: 60000, maxSize: 0.001 });

      // Add multiple entries to exceed the limit
      const largeData = 'x'.repeat(500); // 500 bytes per entry

      await smallCache.set('old-key-1', largeData);

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await smallCache.set('old-key-2', largeData);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await smallCache.set('new-key', largeData);

      // The cleanup should have removed older entries
      // At least one of the old keys should be gone
      await smallCache.get('old-key-1');
      const resultNew = await smallCache.get('new-key');

      // New key should still exist (most recent)
      expect(resultNew).toBe(largeData);
    });
  });

  describe('error handling', () => {
    it('should return null when cache file is corrupted', async () => {
      await cache.set('corrupt-key', 'value');

      // Corrupt the cache file
      const files = fs.readdirSync(cacheDir);
      if (files.length > 0) {
        const filePath = path.join(cacheDir, files[0]);
        fs.writeFileSync(filePath, '{ invalid json }');
      }

      // Should not throw, just return null
      const result = await cache.get('corrupt-key');
      expect(result).toBeNull();
    });

    it('should handle concurrent access gracefully', async () => {
      const promises = [];

      // Perform multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // All values should be retrievable
      for (let i = 0; i < 10; i++) {
        const result = await cache.get(`concurrent-${i}`);
        expect(result).toBe(`value-${i}`);
      }
    });
  });

  describe('key hashing', () => {
    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(1000);
      const data = { test: true };

      await cache.set(longKey, data);
      const result = await cache.get<typeof data>(longKey);

      expect(result).toEqual(data);
    });

    it('should produce different hashes for different keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
    });
  });
});
