/**
 * Resilient Relay - HTTP Server
 *
 * A learning project for reliability patterns.
 * Step 2: Added retry logic with exponential backoff + jitter.
 */

import express, { Request, Response } from 'express';
import { config } from './config';
import { callDownstream } from './downstream/flaky-client';
import { retryWithBackoff } from './core/retry-manager';
import { RelayRequest, RelayResponse } from './types';

const app = express();

// Middleware
app.use(express.json());

/**
 * POST /relay
 *
 * Accepts a request and forwards it to the downstream service.
 * Now with retry logic! Failed requests are retried up to maxRetries times
 * with exponential backoff + jitter to prevent thundering herd.
 *
 * Still TODO: Queue, idempotency checking, worker pool, DLQ
 */
app.post('/relay', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request: RelayRequest = {
      data: req.body,
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    };

    console.log('[RELAY] Received request:', {
      idempotencyKey: request.idempotencyKey,
      hasData: !!request.data,
    });

    // Wrap downstream call with retry logic
    const retryResult = await retryWithBackoff(async () => {
      const result = await callDownstream(request.data);

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

  Endpoints:
    POST /relay     - Forward requests to downstream
    GET  /health    - Health check

  Try it:
    curl -X POST http://localhost:${config.port}/relay \\
      -H "Content-Type: application/json" \\
      -d '{"test": "data"}'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

export default app;
