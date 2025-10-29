/**
 * BoundedQueue - Fixed-capacity queue with backpressure
 *
 * WHY THIS PATTERN EXISTS:
 * Unbounded queues are a common cause of OOM (out of memory) crashes.
 * During traffic spikes, an unbounded queue grows indefinitely until memory exhausted.
 *
 * SOLUTION:
 * - Fixed capacity (e.g., 100 items)
 * - Reject new work when full (return false from enqueue)
 * - This provides "backpressure" - signal to caller that we're overloaded
 *
 * TRADE-OFFS:
 * ✅ Prevents OOM crashes - bounded memory usage
 * ✅ Fail fast - reject early instead of accepting work we'll drop later
 * ✅ Enables graceful degradation - service stays up, just rejects some requests
 * ❌ Clients see 429 errors - must implement retry logic
 * ❌ Potential for dropped work - if queue stays full, legitimate requests rejected
 *
 * LEARNING GOALS:
 * - Understand why bounded queues are non-negotiable in production
 * - Experiment with capacity sizing (too small = frequent 429s, too large = high latency)
 * - Observe how backpressure protects the service under load
 */

/**
 * Work item in the queue
 */
export interface QueueItem<T> {
  data: T;
  enqueuedAt: number; // Timestamp for observability
}

/**
 * BoundedQueue with fixed capacity
 *
 * Operations:
 * - enqueue(item): Add to queue, return false if full
 * - dequeue(): Remove and return oldest item, return null if empty
 * - isFull(): Check if at capacity
 * - isEmpty(): Check if empty
 * - size(): Current number of items
 */
export class BoundedQueue<T> {
  private queue: QueueItem<T>[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Queue capacity must be positive');
    }
    this.capacity = capacity;
  }

  /**
   * Add item to queue
   *
   * @returns true if enqueued successfully, false if queue is full
   */
  enqueue(data: T): boolean {
    if (this.isFull()) {
      // Queue is at capacity - reject this work
      // The caller should return 429 to the client
      return false;
    }

    this.queue.push({
      data,
      enqueuedAt: Date.now(),
    });

    return true;
  }

  /**
   * Remove and return oldest item from queue
   *
   * @returns QueueItem if queue not empty, null otherwise
   */
  dequeue(): QueueItem<T> | null {
    if (this.isEmpty()) {
      return null;
    }

    // Remove from front of queue (FIFO)
    return this.queue.shift() || null;
  }

  /**
   * Check if queue is at capacity
   */
  isFull(): boolean {
    return this.queue.length >= this.capacity;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get current number of items in queue
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Get queue capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get queue utilization as percentage (0-100)
   * Useful for observability and load shedding decisions
   */
  getUtilization(): number {
    return (this.queue.length / this.capacity) * 100;
  }
}
