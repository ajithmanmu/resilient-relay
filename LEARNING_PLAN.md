# Resilient Relay - Learning Plan

## 🎯 Project Status: Steps 1-4 Complete

**Completed:** October 27-30, 2025
**Time Investment:** ~4 hours across 3 sessions
**Core Patterns Implemented:** Retry, Bounded Queue, Idempotency

---

## Phase 1: Reading & Understanding

### ✅ 1. AWS Builders' Library — Timeouts, retries, and backoff with jitter
**Read:** https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

**Status:** ✅ COMPLETED - October 27, 2025

**Key takeaways learned:**
- Exponential backoff without jitter creates "thundering herd"
- Full jitter spreads retry load evenly across time
- Hard timeouts prevent hanging on slow downstream services

**Implemented:**
- ✅ `RetryManager` class with exponential backoff + full jitter
- ✅ Timeout wrapper using `Promise.race()`
- ✅ Tested with 30% and 80% failure rates

---

### ✅ 2. Google SRE Book — Handling Overload
**Read:** https://sre.google/sre-book/handling-overload/

**Status:** ✅ COMPLETED - October 28, 2025

**Key takeaways learned:**
- Returning 429/503 early (fail fast) is better than accepting work you'll drop
- Adaptive throttling at client side (track accepts vs requests)
- **Critical:** Retry only one layer above to prevent exponential amplification
- Request criticality ranking (Critical, Critical+Shareable, Shareable)
- Per-client quotas prevent noisy neighbor problem

**Implemented:**
- ✅ `BoundedQueue` with fixed capacity (100 items)
- ✅ Returns 429 when queue full
- ✅ **Key Discovery:** Queue needs worker pool for true backpressure (see notes below)

**Important Note on Worker Pools:**
During testing, we discovered the bounded queue never filled up because we process requests synchronously. Node.js handles all requests concurrently, so the queue never builds up. **True backpressure requires a worker pool** (Step 5) to limit concurrency. Without it, the queue is just capacity checking, not throughput control.

---

### ✅ 3. Stripe — Idempotent requests
**Read:** https://docs.stripe.com/api/idempotent_requests

**Status:** ✅ COMPLETED - October 30, 2025

**Key takeaways learned:**
- Idempotency keys prevent duplicate processing during retries
- 24-hour TTL (Stripe's approach)
- Client generates keys (server can't know what makes requests "the same")
- Only cache successful responses (failures should be retryable)
- Track in-flight vs completed status to handle concurrent duplicates

**Implemented:**
- ✅ `IdempotencyStore` with 24-hour TTL
- ✅ Duplicate detection in `/relay` endpoint
- ✅ Returns 409 Conflict for in-flight duplicates
- ✅ Returns cached response for completed requests
- ✅ Optional feature (only if client provides key)
- ✅ Automatic cleanup every 10 minutes

---

### ⏸️ 4. AWS SQS Docs — Dead-letter queues
**Read:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html

**Status:** ⏸️ NOT STARTED (Future Enhancement)

**What it would implement:**
- `DeadLetterQueue` for exhausted retries
- Inspection endpoint: `GET /dlq`
- Manual replay capability

**Why it matters:**
- Quarantine failed work instead of dropping it
- Enable manual inspection and debugging
- Support replay after fixing root cause

---

### ⏸️ 5. Grafana RED Method
**Read:** https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/

**Status:** ⏸️ NOT STARTED (Future Enhancement)

**What it would implement:**
- `StatsCollector` for RED metrics (Rate, Errors, Duration)
- Enhanced `/health` endpoint
- New `/stats` endpoint

**Why it matters:**
- Minimum observability for production services
- Track request rate, error rate, latency percentiles
- Determine service health at a glance

---

## Phase 2: Implementation Progress

### ✅ Step 1: Basic HTTP Server + Flaky Downstream
**Status:** ✅ COMPLETED - October 27, 2025
**Duration:** ~30 minutes

**What we built:**
- Express server with `/relay` and `/health` endpoints
- Simulated flaky downstream (30% failure rate)
- TypeScript types and configuration system

**Key learning:** Without resilience patterns, 30% of requests fail permanently.

---

### ✅ Step 2: Retry with Backoff + Jitter
**Status:** ✅ COMPLETED - October 27, 2025
**Duration:** ~45 minutes

**What we built:**
- `RetryManager` with exponential backoff + full jitter
- Hard timeouts (5 seconds per attempt)
- Max 3 retries (4 total attempts)

**Key learning:** Retry improved success rate from 70% → 99%+ with proper backoff.

**Results:**
- 30% failure rate → 99.19% eventual success
- Latency trade-off: ~100ms first attempt, ~500ms after retries

---

### ✅ Step 3: Bounded Queue + Backpressure
**Status:** ✅ COMPLETED - October 28, 2025
**Duration:** ~60 minutes

**What we built:**
- `BoundedQueue` with capacity 100
- Returns 429 when full
- FIFO semantics

**Key learning:** **Bounded queues need worker pools for true backpressure.** Without limited workers, Node.js processes all requests concurrently and the queue never fills up. The queue provides capacity checking but not throughput control.

**What's missing:** Worker pool (Step 5) to limit concurrency and actually fill the queue.

---

### ✅ Step 4: Idempotency Store
**Status:** ✅ COMPLETED - October 30, 2025
**Duration:** ~90 minutes

**What we built:**
- `IdempotencyStore` with 24-hour TTL
- Integration into `/relay` endpoint
- Detects in-flight vs completed requests
- Returns 409 for concurrent duplicates

**Key learning:** Idempotency is critical for payment/subscription systems. Without it, network retries cause duplicate charges.

**Test results:**
- First request: Processed and cached
- Duplicate request: Returned cached response instantly (same timestamp!)
- Proved idempotency working correctly

---

### ⏸️ Step 5: Worker Pool (NOT IMPLEMENTED - Future Work)
**Status:** ⏸️ DEFERRED

**What it would implement:**
- `WorkerPool` with fixed number of workers (e.g., 5)
- Workers continuously pull from queue
- True async processing (enqueue and return immediately)
- Callback mechanism for request completion

**Why it matters - THE MISSING PIECE FOR BACKPRESSURE:**

Without worker pool:
```
Request arrives → Enqueue → Immediately dequeue → Process with await → Done
Queue size: always 0 (never builds up)
Result: No 429s, no backpressure
```

With worker pool:
```
Request arrives → Enqueue → Return immediately
5 workers continuously processing from queue
When all workers busy AND queue full → Return 429
Result: True backpressure, observable 429s
```

**The key insight:**
Bounded queue alone = capacity checking
Bounded queue + worker pool = throughput control + backpressure

**When to implement:**
- When you want to see the queue actually fill up and generate 429s
- When you want to complete the full resilience pattern story
- When you want to see true backpressure in action

**Estimated time:** ~60-90 minutes

---

### ⏸️ Step 6: Dead Letter Queue (NOT IMPLEMENTED - Future Work)
**Status:** ⏸️ DEFERRED

**What it would implement:**
- `DeadLetterQueue` for requests that fail after max retries
- Inspection endpoint: `GET /dlq`
- Manual replay capability

**Why it matters:**
- Currently, failed requests after max retries are just logged and lost
- DLQ quarantines them for manual inspection
- Enables debugging and replay after fixing root cause

**Estimated time:** ~30 minutes

---

### ⏸️ Step 7: Observability (NOT IMPLEMENTED - Future Work)
**Status:** ⏸️ DEFERRED

**What it would implement:**
- `StatsCollector` for RED metrics
- Enhanced `/health` endpoint with metrics
- New `/stats` endpoint

**Why it matters:**
- Production services need observability
- RED metrics (Rate, Errors, Duration) tell you if service is healthy
- Critical for on-call debugging

**Estimated time:** ~30 minutes

---

## Phase 2: Implementation Plan

We'll build the service in this order, implementing one pattern at a time:

### Step 1: Basic HTTP Server + Flaky Downstream (30 min)
**Goal:** Get a request from client → call flaky downstream → return result

**Files to create:**
- `src/server.ts` - Express server
- `src/downstream/flaky-client.ts` - Simulated flaky service
- `src/types.ts` - TypeScript interfaces

**Test it:**
```bash
curl -X POST http://localhost:3000/relay -d '{"test": "data"}'
# Should succeed or fail randomly
```

---

### Step 2: Retry with Backoff + Jitter (45 min)
**Goal:** Retry failed requests with exponential backoff

**Files to create:**
- `src/core/retry-manager.ts`
- `src/config.ts` - Configuration values

**Test it:**
- Set downstream to 80% failure rate
- Watch logs for retry attempts with delays
- Observe jitter in retry timing

---

### Step 3: Bounded Queue + Backpressure (45 min)
**Goal:** Queue requests, return 429 when full

**Files to create:**
- `src/core/bounded-queue.ts`
- `src/api/relay.controller.ts` - POST /relay endpoint

**Test it:**
- Send 200 requests rapidly (queue capacity = 100)
- Verify some get 429 responses
- Check that service doesn't crash

---

### Step 4: Idempotency Store (30 min)
**Goal:** Deduplicate retry requests

**Files to create:**
- `src/core/idempotency-store.ts`

**Test it:**
- Send same request twice with same idempotency key
- Verify second request returns cached result
- Verify different keys create new work

---

### Step 5: Worker Pool (45 min)
**Goal:** N workers processing from queue concurrently

**Files to create:**
- `src/core/worker-pool.ts`

**Test it:**
- Enqueue 50 items
- Watch 5 workers process them concurrently
- Verify all items eventually complete

---

### Step 6: Dead Letter Queue (30 min)
**Goal:** Quarantine exhausted retries

**Files to create:**
- `src/core/dead-letter-queue.ts`

**Test it:**
- Set downstream to 100% failure
- Send requests that will fail after max retries
- Verify they appear in `GET /dlq`

---

### Step 7: Observability (30 min)
**Goal:** Expose RED metrics

**Files to create:**
- `src/core/stats-collector.ts`
- `src/api/health.controller.ts`

**Test it:**
- Send mix of successful/failed requests
- Check `GET /stats` shows request rate, error rate, latency percentiles

---

## Phase 3: Experimentation (After Implementation)

Once everything is built, experiment with:

### Experiment 1: Jitter Comparison
- Implement retry without jitter
- Compare load distribution with full jitter
- Observe thundering herd effect

### Experiment 2: Queue Sizing
- Set queue capacity to 10, 100, 1000
- Send traffic spike (500 req/sec)
- Observe: 429 rate, memory usage, latency

### Experiment 3: Timeout Tuning
- Set timeout to 1s, 5s, 10s
- Measure: success rate, latency, retry count
- Find optimal timeout for your use case

### Experiment 4: Worker Pool Sizing
- Test with 1, 5, 10, 20 workers
- Measure: throughput, latency, downstream load
- Find optimal worker count

---

## Decision Log (We'll Fill This In As We Go)

As we implement each pattern, we'll document:
- **What problem does this solve?**
- **What new risks does it introduce?**
- **What config knobs matter?**
- **What default values did we choose and why?**

This helps solidify understanding and provides valuable documentation.

---

## Next Steps

1. Start with the first reading (AWS Builders' Library)
2. Come back and tell me the key insights you got
3. We'll implement that pattern together
4. Repeat for each reading

Ready to start with reading #1?
