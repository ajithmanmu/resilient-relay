/**
 * Core types for the Resilient Relay service
 */

/**
 * Request payload that clients send to our relay service
 */
export interface RelayRequest {
  // The actual data to forward to downstream
  data: unknown;
  // Optional idempotency key for duplicate detection (we'll use this in Step 4)
  idempotencyKey?: string;
}

/**
 * Response returned to clients
 */
export interface RelayResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  // Metadata for debugging
  metadata?: {
    attempts?: number;
    processingTimeMs?: number;
  };
}

/**
 * Result from downstream service call
 */
export interface DownstreamResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
