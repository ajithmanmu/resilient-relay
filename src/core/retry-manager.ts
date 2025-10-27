/**
 * RetryManager - Handles retries with exponential backoff and jitter
 *
 * Key Concepts (from AWS Builders' Library):
 * 1. Exponential Backoff: Delay doubles each retry (100ms, 200ms, 400ms, ...)
 * 2. Full Jitter: Randomizes delay between 0 and calculated value
 * 3. Hard Timeout: Enforces maximum wait time per attempt
 *
 * Why Jitter?
 * Without jitter, if 1000 clients all fail at the same time, they all retry
 * at exactly 100ms, then 200ms, then 400ms - creating synchronized "thundering herd".
 * Jitter spreads the load randomly across time, allowing the downstream service
 * to recover gracefully.
 */

import { config } from '../config';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTimeMs: number;
}

/**
 * Retries a function with exponential backoff and full jitter
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns Result with success status, data/error, and metadata
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {
    maxRetries: config.maxRetries,
    initialDelayMs: config.initialRetryDelayMs,
    maxDelayMs: config.maxRetryDelayMs,
    timeoutMs: config.requestTimeoutMs,
  }
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: string = 'Unknown error';

  // Try initial attempt + retries
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt + 1}/${options.maxRetries + 1}`);

      // Enforce hard timeout on this attempt
      const result = await withTimeout(fn(), options.timeoutMs);

      const totalTimeMs = Date.now() - startTime;
      console.log(`[RETRY] Success on attempt ${attempt + 1} (total time: ${totalTimeMs}ms)`);

      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalTimeMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`[RETRY] Attempt ${attempt + 1} failed: ${lastError}`);

      // If this was the last attempt, don't sleep
      if (attempt === options.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff + full jitter
      const delay = calculateDelayWithJitter(
        attempt,
        options.initialDelayMs,
        options.maxDelayMs
      );

      console.log(`[RETRY] Waiting ${delay}ms before retry ${attempt + 2}...`);
      await sleep(delay);
    }
  }

  // All retries exhausted
  const totalTimeMs = Date.now() - startTime;
  console.log(`[RETRY] All ${options.maxRetries + 1} attempts failed (total time: ${totalTimeMs}ms)`);

  return {
    success: false,
    error: lastError,
    attempts: options.maxRetries + 1,
    totalTimeMs,
  };
}

/**
 * Calculates retry delay using capped exponential backoff with full jitter
 *
 * Formula:
 * 1. Exponential backoff: baseDelay * (2 ^ attempt)
 * 2. Cap at maxDelay: min(calculated, maxDelay)
 * 3. Full jitter: random(0, capped)
 *
 * Example with initialDelay=100ms, maxDelay=10s:
 * - Attempt 0: 0-100ms      (2^0 = 1, capped at 100ms)
 * - Attempt 1: 0-200ms      (2^1 = 2, 100*2 = 200ms)
 * - Attempt 2: 0-400ms      (2^2 = 4, 100*4 = 400ms)
 * - Attempt 3: 0-800ms      (2^3 = 8, 100*8 = 800ms)
 * - Attempt 4: 0-1600ms     (2^4 = 16, 100*16 = 1600ms)
 * - Attempt 10: 0-10000ms   (2^10 = 1024, capped at 10s)
 */
function calculateDelayWithJitter(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);

  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Full jitter: random between 0 and cappedDelay
  const jitteredDelay = Math.random() * cappedDelay;

  return Math.floor(jitteredDelay);
}

/**
 * Wraps a promise with a hard timeout
 *
 * Uses Promise.race() - whichever resolves first (work or timeout) wins.
 * This prevents hanging indefinitely if downstream service doesn't respond.
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Maximum time to wait
 * @returns The promise result or throws TimeoutError
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Race: whichever completes first wins
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
