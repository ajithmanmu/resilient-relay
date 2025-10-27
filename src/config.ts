/**
 * Configuration for the Resilient Relay service
 *
 * These values are set for learning and experimentation.
 * In production, these would come from environment variables.
 */

export const config = {
  // Server
  port: 3000,

  // Downstream Service Simulation
  // High failure rate to make resilience patterns observable
  downstreamFailureRate: 0.3, // 30% of requests fail
  downstreamLatencyMs: 100,    // Base latency for successful requests

  // Retry Configuration (will implement in Step 2)
  maxRetries: 3,              // Industry standard - balances persistence vs retry storms
  initialRetryDelayMs: 100,   // Fast for learning, observable in logs
  maxRetryDelayMs: 10000,     // Caps exponential growth at 10 seconds

  // Timeouts
  requestTimeoutMs: 5000,     // Hard timeout - fail fast but generous for realistic work

  // Queue Configuration (will implement in Step 3)
  queueCapacity: 100,         // Small enough to hit limits during testing

  // Worker Pool (will implement in Step 5)
  workerCount: 5,             // Enough parallelism to observe, small enough to debug

  // Idempotency (will implement in Step 4)
  idempotencyTtlMs: 24 * 60 * 60 * 1000, // 24 hours (following Stripe's approach)
};
