/**
 * Simple In-Memory LRU Cache with TTL
 *
 * Provides a `withCache(key, ttl, fetcher)` utility for caching expensive
 * database queries and API calls. Entries expire after their TTL and are
 * evicted LRU-style when the cache exceeds maxSize.
 *
 * Usage:
 *   import { withCache, invalidateCache } from "./_core/cache";
 *
 *   // Cache a DB query for 60 seconds
 *   const listings = await withCache("marketplace:browse", 60, () => db.select().from(table));
 *
 *   // Invalidate after a write
 *   invalidateCache("marketplace:browse");
 *
 *   // Invalidate all keys matching a prefix
 *   invalidateCachePrefix("marketplace:");
 */

import { createLogger } from "./logger.js";

const log = createLogger("Cache");

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

const MAX_SIZE = 500;
const cache = new Map<string, CacheEntry<unknown>>();

/** Evict expired entries and oldest entries if over max size */
function evict() {
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  // If still over max, remove least recently accessed
  if (cache.size > MAX_SIZE) {
    const entries = [...cache.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    const toRemove = entries.slice(0, cache.size - MAX_SIZE);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

/**
 * Get a value from cache or compute it using the fetcher.
 *
 * @param key - Unique cache key (e.g., "marketplace:browse:page1")
 * @param ttlSeconds - Time-to-live in seconds
 * @param fetcher - Async function that computes the value on cache miss
 * @returns The cached or freshly computed value
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    existing.lastAccessed = now;
    return existing.value;
  }

  // Cache miss — compute the value
  const value = await fetcher();

  cache.set(key, {
    value,
    expiresAt: now + ttlSeconds * 1000,
    lastAccessed: now,
  });

  // Periodic eviction (every 100 writes)
  if (cache.size % 100 === 0) {
    evict();
  }

  return value;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 * Useful after writes: `invalidateCachePrefix("marketplace:")`
 */
export function invalidateCachePrefix(prefix: string): void {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    log.debug("Cache invalidated", { prefix, count });
  }
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_SIZE };
}

/**
 * Clear the entire cache. Useful for testing.
 */
export function clearCache(): void {
  cache.clear();
}
