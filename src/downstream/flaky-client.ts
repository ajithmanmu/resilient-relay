/**
 * Simulates a flaky downstream service
 *
 * This represents a real external API that:
 * - Sometimes fails (network errors, 500s, timeouts)
 * - Takes variable time to respond
 * - Needs retry logic to handle reliably
 */

import { config } from '../config';
import { DownstreamResult } from '../types';

/**
 * Simulates calling an unreliable downstream service
 *
 * @param data - The payload to send to downstream
 * @returns Promise that resolves or rejects randomly based on failureRate
 */
export async function callDownstream(data: unknown): Promise<DownstreamResult> {
  // Simulate network latency
  await sleep(config.downstreamLatencyMs);

  // Randomly fail based on configured failure rate
  const shouldFail = Math.random() < config.downstreamFailureRate;

  if (shouldFail) {
    // Simulate various failure modes
    const errors = [
      'ECONNREFUSED: Connection refused',
      'ETIMEDOUT: Request timeout',
      'HTTP 500: Internal Server Error',
      'HTTP 503: Service Unavailable',
    ];
    const randomError = errors[Math.floor(Math.random() * errors.length)];

    return {
      success: false,
      error: randomError,
    };
  }

  // Success case
  return {
    success: true,
    data: {
      message: 'Processed successfully',
      receivedData: data,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Helper to simulate async delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
