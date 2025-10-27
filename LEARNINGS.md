# Resilient Relay - Learning Journal

A chronological record of building reliability patterns from first principles.

---

## Step 1: Basic HTTP Server + Flaky Downstream
**Date:** October 27, 2025
**Duration:** ~30 minutes

### What We Built
- Express server with `/relay` and `/health` endpoints
- Simulated flaky downstream service (30% failure rate)
- Basic TypeScript types for requests and responses
- Configuration system for tunable parameters

**Files Created:**
- `src/types.ts` - Type definitions
- `src/config.ts` - Configuration values
- `src/downstream/flaky-client.ts` - Flaky service simulator
- `src/server.ts` - Express HTTP server

### Test Results
Sent 10 requests to observe baseline behavior:
- **8 requests succeeded** (200 OK)
- **2 requests failed** (502 Bad Gateway)
- **Failure rate:** 20% (within expected variance of configured 30%)
- **Processing time:** ~100ms per request

**Example Success Response:**
```json
{
  "success": true,
  "data": { "message": "Processed successfully", ... },
  "metadata": { "processingTimeMs": 102, "attempts": 1 }
}
```

**Example Failure Response:**
```json
{
  "success": false,
  "error": "HTTP 500: Internal Server Error",
  "metadata": { "processingTimeMs": 100, "attempts": 1 }
}
```

### Key Observations

**Current Behavior:**
- Requests are processed synchronously (one at a time, no queue)
- Downstream failures immediately return 502 to the client
- No retry logic - transient failures become permanent failures
- Each request is independent (no correlation or tracking)

**Problems Identified:**
- ❌ **No retry logic** - A brief network blip causes permanent failure
- ❌ **No timeout enforcement** - If downstream hangs, we hang forever
- ❌ **No backpressure mechanism** - Would accept unlimited concurrent requests (OOM risk)
- ❌ **No idempotency checking** - Client retries could cause duplicate processing

### Design Decisions

**Downstream Failure Rate: 30%**
- High enough to trigger failures regularly during testing
- Realistic representation of unstable external services
- Allows us to observe resilience patterns in action

**Base Latency: 100ms**
- Fast enough for rapid testing iterations
- Slow enough to observe timing in logs
- Realistic for network calls within same region

**HTTP Status Codes:**
- `200 OK` - Successful downstream processing
- `502 Bad Gateway` - Downstream service failed (correct semantic)
- `500 Internal Server Error` - Unexpected server errors

**Simulated Error Types:**
- `ECONNREFUSED` - Connection refused
- `ETIMEDOUT` - Request timeout
- `HTTP 500` - Internal server error
- `HTTP 503` - Service unavailable

### Key Insights to Share

1. **Flaky services are the norm, not the exception** - Even with 30% failure rate, most requests still succeed. But without resilience patterns, those 30% become permanent failures for users.

2. **Returning 502 vs 500 matters** - 502 Bad Gateway correctly signals "downstream failed" vs 500 "our server failed". This helps with debugging and monitoring.

3. **Configuration-driven design enables experimentation** - Having all tunable parameters in one file makes it easy to adjust failure rates, latencies, and retry settings without changing code.

4. **Observability from day one** - Even our basic server logs every request and tracks processing time. This foundation will be critical when we add retry logic and need to debug timing issues.

5. **Why we need resilience patterns:**
   - A payment gateway that's 99.9% reliable still fails 1 in 1000 requests
   - Without retry logic, users see those failures immediately
   - With proper retry + backoff, most transient failures are recovered transparently

### What's Next
In Step 2, we'll implement a `RetryManager` with exponential backoff and jitter to handle transient failures gracefully.

---

## Step 2: Retry Manager with Exponential Backoff + Jitter
**Date:** October 27, 2025
**Duration:** ~45 minutes

### What We Built
- `RetryManager` class with exponential backoff and full jitter
- Hard timeout wrapper using `Promise.race()`
- Integration into the `/relay` endpoint to automatically retry failed downstream calls

**Files Created/Modified:**
- `src/core/retry-manager.ts` - Retry logic with backoff + jitter
- `src/server.ts` - Updated to use `retryWithBackoff()`

### How It Works

**Retry Algorithm:**
1. **Exponential Backoff**: Delay doubles each retry (100ms → 200ms → 400ms → ...)
2. **Capped Backoff**: Maximum delay capped at 10 seconds (prevents infinite growth)
3. **Full Jitter**: Randomize delay between 0 and calculated value
4. **Hard Timeout**: Each attempt has a 5-second timeout via `Promise.race()`

**Formula:**
```
delay = random(0, min(maxDelay, initialDelay * 2^attemptNumber))
```

**Example delay ranges:**
- Attempt 0: 0-100ms
- Attempt 1: 0-200ms
- Attempt 2: 0-400ms
- Attempt 3: 0-800ms

### Test Results

#### Test 1: Normal Failure Rate (30%)
Sent 6 requests with 30% downstream failure rate:

**Results:**
- 5 requests succeeded on first attempt (attempts: 1)
- 1 request succeeded after 3 attempts (attempts: 3)

**Example retry sequence from logs:**
```
[RETRY] Attempt 1/4
[RETRY] Attempt 1 failed: HTTP 503: Service Unavailable
[RETRY] Waiting 29ms before retry 2...
[RETRY] Attempt 2/4
[RETRY] Attempt 2 failed: HTTP 503: Service Unavailable
[RETRY] Waiting 194ms before retry 3...
[RETRY] Attempt 3/4
[RETRY] Success on attempt 3 (total time: 527ms)
```

**Observation:** Without retry, this request would have been a permanent failure. With retry, it succeeded after 527ms.

#### Test 2: High Failure Rate (80% - Stress Test)
Sent 5 requests with 80% downstream failure rate:

**Results:**
- 3 requests succeeded after exhausting all 4 attempts
- 2 requests failed even after 4 attempts

**Success example (request 2):**
```
[RETRY] Attempt 1 failed: HTTP 503
[RETRY] Waiting 28ms before retry 2...
[RETRY] Attempt 2 failed: HTTP 503
[RETRY] Waiting 46ms before retry 3...
[RETRY] Attempt 3 failed: ECONNREFUSED
[RETRY] Waiting 61ms before retry 4...
[RETRY] Attempt 4: Success
Total time: 541ms
```

**Failure example (request 1):**
```
[RETRY] Attempt 1 failed: ETIMEDOUT
[RETRY] Waiting 53ms...
[RETRY] Attempt 2 failed: HTTP 503
[RETRY] Waiting 170ms...
[RETRY] Attempt 3 failed: HTTP 503
[RETRY] Waiting 280ms...
[RETRY] Attempt 4 failed: HTTP 503
[RETRY] All 4 attempts failed (total time: 917ms)
```

### Key Observations

**Jitter in Action:**
Comparing two requests that both failed on attempts 1-3:
- **Request 2 delays:** 28ms, 46ms, 61ms
- **Request 3 delays:** 17ms, 115ms, 337ms

Notice the delays are **different for each request** - this is full jitter preventing thundering herd.

**Exponential Growth:**
- Delay ranges double each attempt: 0-100ms, 0-200ms, 0-400ms
- This spreads retry load over time instead of overwhelming the downstream

**Success Rate Improvement:**
- **30% failure rate:** Almost all requests eventually succeed with retries
- **80% failure rate:** 60% of requests still recovered (3/5 succeeded)
- Without retry logic, 100% of failed first attempts would be permanent failures

**Latency Trade-off:**
- Successful first attempt: ~100ms
- Successful after 3 retries: ~500ms
- Failed after 4 attempts: ~900ms

This is the cost of resilience - we trade higher latency for higher success rate.

### Design Decisions

**maxRetries: 3**
- Industry standard (total 4 attempts: initial + 3 retries)
- With 30% failure rate, probability all 4 attempts fail: 0.3^4 = 0.81% (very low)
- Balances persistence vs retry storms

**initialRetryDelayMs: 100ms**
- Fast enough for responsive system
- Observable in logs during learning
- Production might use 1000ms depending on SLA

**maxRetryDelayMs: 10000ms (10 seconds)**
- Prevents exponential backoff from growing indefinitely
- After 7 retries, delay would be 0-12800ms, but we cap at 10s
- Prevents extremely long waits

**Full Jitter (vs other strategies):**
- **No jitter:** All clients retry at exact same time → thundering herd
- **Equal jitter:** delay = baseDelay + random(0, jitter) → still synchronized
- **Full jitter:** delay = random(0, cappedDelay) → maximum spread

**Hard Timeout: 5000ms per attempt**
- Without timeout, a hanging downstream service blocks our threads forever
- With timeout, we fail fast and can retry or return error
- Uses `Promise.race()` - whichever resolves first (work or timeout) wins

### Problems Solved

✅ **Transient failures now auto-recover** - Network blips don't become permanent failures
✅ **Hard timeouts prevent hangs** - Downstream hanging doesn't block our service
✅ **Jitter prevents thundering herd** - Failed clients don't all retry simultaneously
✅ **Exponential backoff reduces load** - Gives downstream time to recover

### Remaining Problems

❌ **No backpressure** - Still accept unlimited concurrent requests (OOM risk)
❌ **No idempotency** - Client retries could cause duplicate processing
❌ **No DLQ** - Failed requests after max retries are just logged and lost
❌ **No observability** - Can't track success rate, P99 latency, etc.

### Key Insights to Share

1. **Retry logic is non-negotiable for production systems** - Assuming networks are reliable is naive. Even Amazon's internal network has transient failures.

2. **Jitter is not optional** - Without jitter, synchronized retries create a "retry storm" that makes recovery impossible. It's the difference between graceful degradation and cascading failure.

3. **Exponential backoff gives downstream time to recover** - If a service is overloaded, hitting it repeatedly at the same rate just makes it worse. Exponential backoff naturally reduces load.

4. **Hard timeouts are critical** - Without timeouts, slow downstream services cause thread/connection pool exhaustion in your service. Always use `Promise.race()` or similar timeout mechanisms.

5. **There's always a latency/reliability trade-off** - Retry logic increases P99 latency (requests that need retries take longer), but dramatically improves success rate. You can't have both instant response AND perfect reliability.

6. **Why retries work for transient failures:**
   - Network issues often resolve in milliseconds
   - Load balancers might route to healthy instances on retry
   - Downstream services might recover between attempts
   - The key is "transient" - permanent failures still fail after retries

7. **Understanding probability:**
   - With 30% failure rate and 4 attempts: 99.19% eventual success rate
   - With 80% failure rate and 4 attempts: 59.84% eventual success rate
   - Formula: success = 1 - (failureRate ^ attempts)

### What's Next
In Step 3, we'll implement a bounded queue with backpressure to handle traffic spikes without crashing.

---
