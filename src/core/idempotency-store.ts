/**
 * IdempotencyStore - Prevent duplicate processing of requests
 *
 * WHY THIS PATTERN EXISTS:
 * Network failures can cause clients to retry requests. Without idempotency,
 * retries can create duplicate resources (e.g., double charges, duplicate subscriptions).
 *
 * SOLUTION:
 * - Client sends unique idempotency key with each request
 * - Server caches successful responses for 24 hours
 * - Duplicate requests return cached response instead of reprocessing
 *
 * TRADE-OFFS:
 * ✅ Prevents duplicate processing - Safe retries
 * ✅ Reduces downstream load - Cached responses are instant
 * ✅ Better UX - Clients can safely retry without fear of duplicates
 * ❌ Memory usage - Stores responses for TTL period
 * ❌ Stale data - Returns cached response even if system state changed
 * ❌ Not distributed - In-memory only (lost on restart)
 *
 * PRODUCTION CONSIDERATIONS:
 * - Use Redis or DynamoDB for distributed cache
 * - Add metrics for cache hit rate
 * - Consider per-endpoint scoping (same key on different endpoints = different requests)
 *
 * EXAMPLE USAGE:
 * ```typescript
 * const store = new IdempotencyStore(24 * 60 * 60 * 1000); // 24 hours
 *
 * // Check if already processed
 * const cached = store.get('req_abc123');
 * if (cached?.status === 'completed') {
 *   return cached; // Return cached response
 * }
 *
 * // Mark as in-flight
 * store.markInFlight('req_abc123');
 *
 * // Process request...
 * const result = await processRequest();
 *
 * // Mark as completed
 * store.markCompleted('req_abc123', 200, result);
 * ```
 */

/**
 * Status of an idempotency entry
 */
export type IdempotencyStatus = 'in_flight' | 'completed';

/**
 * Cached idempotency data
 */
export interface IdempotencyData<T> {
  /** The cached response data (only present when status is 'completed') */
  data?: T;

  /** Timestamp when this entry was first created (used for TTL) */
  cachedTime: number;

  /** HTTP status code of the cached response (only present when status is 'completed') */
  httpStatusCode?: number;

  /** Current status of the request */
  status: IdempotencyStatus;
}

/**
 * IdempotencyStore - In-memory cache for idempotent requests
 *
 * Stores request results keyed by idempotency key with automatic TTL expiration.
 * Prevents duplicate processing when clients retry requests.
 */
export class IdempotencyStore {
  private store: Map<string, IdempotencyData<any>>;
  private ttlMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Create a new IdempotencyStore
   *
   * @param ttlMs - Time-to-live in milliseconds (e.g., 24 hours = 86400000)
   */
  constructor(ttlMs: number) {
    this.store = new Map();
    this.ttlMs = ttlMs;

    // Start periodic cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Get cached entry for an idempotency key
   *
   * @param idempotencyKey - Unique key for this request
   * @returns Cached entry if found and not expired, null otherwise
   */
  get(idempotencyKey: string): IdempotencyData<any> | null {
    if (!this.store.has(idempotencyKey)) {
      return null;
    }

    const storedResponse = this.store.get(idempotencyKey);

    // TypeScript doesn't know that has() guarantees get() returns a value
    if (!storedResponse) {
      return null;
    }

    // Check if entry has expired
    const isExpired = Date.now() > storedResponse.cachedTime + this.ttlMs;
    if (isExpired) {
      this.store.delete(idempotencyKey);
      return null;
    }

    return storedResponse;
  }

  /**
   * Store an idempotency entry (low-level method)
   *
   * Note: Most callers should use markInFlight() or markCompleted() instead.
   *
   * @param idempotencyKey - Unique key for this request
   * @param data - Idempotency data to store
   */
  set(idempotencyKey: string, data: IdempotencyData<any>): void {
    this.store.set(idempotencyKey, data);
  }

  /**
   * Mark a request as currently being processed
   *
   * This prevents duplicate concurrent requests with the same key.
   * Caller should return 409 Conflict if status is already 'in_flight'.
   *
   * @param idempotencyKey - Unique key for this request
   */
  markInFlight(idempotencyKey: string): void {
    this.store.set(idempotencyKey, {
      cachedTime: Date.now(),
      status: 'in_flight',
    });
  }

  /**
   * Mark a request as completed and cache the result
   *
   * Preserves the original cachedTime (doesn't reset TTL).
   * TTL is always measured from the FIRST request, not completion time.
   *
   * @param idempotencyKey - Unique key for this request
   * @param statusCode - HTTP status code of the response
   * @param data - Response data to cache
   */
  markCompleted(idempotencyKey: string, statusCode: number, data: any): void {
    const storedResponse = this.store.get(idempotencyKey);

    // If entry doesn't exist, create new one (shouldn't happen in normal flow)
    if (!storedResponse) {
      this.store.set(idempotencyKey, {
        cachedTime: Date.now(),
        status: 'completed',
        httpStatusCode: statusCode,
        data,
      });
      return;
    }

    // Update existing entry while preserving cachedTime
    this.store.set(idempotencyKey, {
      ...storedResponse,
      data,
      status: 'completed',
      httpStatusCode: statusCode,
    });
  }

  /**
   * Remove expired entries from the store
   *
   * Called automatically every 10 minutes via setInterval.
   * Can also be called manually for immediate cleanup.
   */
  cleanup(): void {
    for (const [key, value] of this.store) {
      const isExpired = Date.now() > value.cachedTime + this.ttlMs;
      if (isExpired) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current number of cached entries
   *
   * Useful for monitoring and debugging.
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries from the store
   *
   * Useful for testing. Not typically used in production.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Stop the automatic cleanup interval
   *
   * Call this when shutting down the service to prevent memory leaks.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}
