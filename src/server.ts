/**
 * Resilient Relay - HTTP Server
 *
 * A learning project for reliability patterns.
 * Step 2: Added retry logic with exponential backoff + jitter.
 * Step 3: Added bounded queue with backpressure (returns 429 when full).
 * Step 4: Added idempotency checking to prevent duplicate processing.
 */

import express, { Request, Response } from 'express';
import { config } from './config';
import { callDownstream } from './downstream/flaky-client';
import { retryWithBackoff } from './core/retry-manager';
import { BoundedQueue } from './core/bounded-queue';
import { IdempotencyStore } from './core/idempotency-store';
import { RelayRequest, RelayResponse } from './types';

const app = express();

// Middleware
app.use(express.json());

// Bounded Queue for backpressure
// Tracks in-flight requests to prevent overload
const requestQueue = new BoundedQueue<RelayRequest>(config.queueCapacity);

// Idempotency Store for preventing duplicate processing
// Caches successful responses for 24 hours (following Stripe's approach)
const idempotencyStore = new IdempotencyStore(config.idempotencyTtlMs);

/**
 * POST /relay
 *
 * Accepts a request and forwards it to the downstream service.
 * Features:
 * - ✅ Retry logic with exponential backoff + jitter
 * - ✅ Bounded queue with backpressure (returns 429 when full)
 * - ✅ Idempotency checking (optional idempotency-key header)
 *
 * Still TODO: Worker pool, Dead Letter Queue (DLQ)
 */
app.post('/relay', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request: RelayRequest = {
      data: req.body,
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    };

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    console.log('[RELAY] Received request:', {
      idempotencyKey,
      queueSize: requestQueue.size(),
      queueCapacity: requestQueue.getCapacity(),
      queueUtilization: `${requestQueue.getUtilization().toFixed(1)}%`,
    });

    // Idempotency check (optional feature - only if client provides key)
    if (idempotencyKey) {
      const cached = idempotencyStore.get(idempotencyKey);

      if (cached) {
        if (cached.status === 'completed') {
          // Request was already processed successfully - return cached response
          console.log('[IDEMPOTENCY] ✅ Returning cached response for key:', idempotencyKey);
          return res.status(cached.httpStatusCode || 200).json(cached.data);
        } else {
          // Request is currently being processed by another handler
          console.log('[IDEMPOTENCY] ⚠️  Request in-flight, returning 409 for key:', idempotencyKey);
          return res.status(409).json({
            success: false,
            error: 'Request with this idempotency key is already being processed',
            metadata: {
              idempotencyKey,
              processingTimeMs: Date.now() - startTime,
            },
          });
        }
      }

      // New request - mark as in-flight to prevent duplicate concurrent processing
      console.log('[IDEMPOTENCY] 🆕 New request, marking as in-flight:', idempotencyKey);
      idempotencyStore.markInFlight(idempotencyKey);
    }

    // Backpressure: Check if queue is full
    // Try to enqueue - if queue is full, this returns false
    const enqueued = requestQueue.enqueue(request);

    if (!enqueued) {
      // Queue is full - reject with 429 Too Many Requests
      // This is "failing fast" - better than accepting work we'll drop later
      console.log('[RELAY] ❌ Queue full - rejecting with 429');

      const response: RelayResponse = {
        success: false,
        error: 'Service overloaded - queue full',
        metadata: {
          processingTimeMs: Date.now() - startTime,
          queueSize: requestQueue.size(),
          queueCapacity: requestQueue.getCapacity(),
        },
      };

      // 429 Too Many Requests - client should implement retry with backoff
      return res.status(429).json(response);
    }

    // Successfully enqueued
    // For now, we'll process immediately (dequeue and process)
    // In Step 5, we'll add worker pool for true async processing
    const queueItem = requestQueue.dequeue();
    if (!queueItem) {
      throw new Error('Failed to dequeue - this should never happen');
    }

    console.log('[RELAY] ✅ Enqueued successfully, processing now...');

    // Wrap downstream call with retry logic
    const retryResult = await retryWithBackoff(async () => {
      const result = await callDownstream(queueItem.data.data);

      // If downstream fails, throw error to trigger retry
      if (!result.success) {
        throw new Error(result.error || 'Downstream failed');
      }

      return result.data;
    });

    const processingTimeMs = Date.now() - startTime;

    if (retryResult.success) {
      const response: RelayResponse = {
        success: true,
        data: retryResult.data,
        metadata: {
          processingTimeMs,
          attempts: retryResult.attempts,
        },
      };
      console.log('[RELAY] Success after', retryResult.attempts, 'attempts');

      // Cache successful response for idempotency
      if (idempotencyKey) {
        idempotencyStore.markCompleted(idempotencyKey, 200, response);
        console.log('[IDEMPOTENCY] 💾 Cached successful response for key:', idempotencyKey);
      }

      res.status(200).json(response);
    } else {
      const response: RelayResponse = {
        success: false,
        error: retryResult.error,
        metadata: {
          processingTimeMs,
          attempts: retryResult.attempts,
        },
      };
      console.log('[RELAY] Failed after', retryResult.attempts, 'attempts:', retryResult.error);

      // Note: We do NOT cache failures - client should be able to retry
      // Failures are often transient (network issues, downstream overload)

      // Return 502 Bad Gateway when all retries exhausted
      res.status(502).json(response);
    }
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error('[RELAY] Unexpected error:', error);

    const response: RelayResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        processingTimeMs,
      },
    };
    res.status(500).json(response);
  }
});

/**
 * GET /health
 *
 * Basic health check endpoint.
 * We'll enhance this with RED metrics in Step 7.
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Start the server
 */
const server = app.listen(config.port, () => {
  console.log(`
🚀 Resilient Relay Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port: ${config.port}
  Downstream Failure Rate: ${config.downstreamFailureRate * 100}%
  Queue Capacity: ${config.queueCapacity}
  Idempotency TTL: ${config.idempotencyTtlMs / 1000 / 60 / 60}h

  Endpoints:
    POST /relay     - Forward requests to downstream
    GET  /health    - Health check

  Try it:
    curl -X POST http://localhost:${config.port}/relay \\
      -H "Content-Type: application/json" \\
      -H "idempotency-key: unique-key-123" \\
      -d '{"test": "data"}'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');

  // Stop idempotency store cleanup interval
  idempotencyStore.destroy();

  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

export default app;
