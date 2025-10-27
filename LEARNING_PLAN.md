# Resilient Relay - Learning Plan

## Phase 1: Reading & Understanding (Do This First)

Read these in order. After each, we'll implement that specific pattern.

### 1. AWS Builders' Library — Timeouts, retries, and backoff with jitter
**Read:** https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

**Key takeaways to look for:**
- Why exponential backoff without jitter creates "thundering herd"
- How full jitter spreads retry load evenly
- Why hard timeouts on outbound calls are non-negotiable

**After reading, we'll implement:**
- `RetryManager` class with exponential backoff + full jitter
- Timeout wrapper using `Promise.race()`

---

### 2. Google SRE Book — Handling Overload
**Read:** https://sre.google/sre-book/handling-overload/

**Key takeaways to look for:**
- Why returning 429/503 early is better than accepting work you'll drop
- Graceful degradation vs falling over
- Shedding load at the edge

**After reading, we'll implement:**
- `BoundedQueue` with fixed capacity
- HTTP endpoint that returns 429 when queue is full

---

### 3. Stripe — Idempotent requests
**Read:** https://docs.stripe.com/api/idempotent_requests

**Key takeaways to look for:**
- How idempotency keys prevent duplicate processing
- 24-hour TTL for cached results
- Client-side key generation

**After reading, we'll implement:**
- `IdempotencyStore` with key → result mapping
- Duplicate detection in the API endpoint

---

### 4. AWS SQS Docs — Dead-letter queues
**Read:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html

**Key takeaways to look for:**
- DLQ is a quarantine, not a trash can
- `maxReceiveCount` determines when messages move to DLQ
- Manual inspection and replay workflow

**After reading, we'll implement:**
- `DeadLetterQueue` for exhausted retries
- Inspection endpoint: `GET /dlq`

---

### 5. Grafana RED Method
**Read:** https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/

**Key takeaways to look for:**
- Minimum observability: Rate, Errors, Duration
- Why these 3 metrics tell you if a service is healthy

**After reading, we'll implement:**
- `StatsCollector` for RED metrics
- Endpoints: `GET /health` and `GET /stats`

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

This becomes your interview talking points.

---

## Next Steps

1. Start with the first reading (AWS Builders' Library)
2. Come back and tell me the key insights you got
3. We'll implement that pattern together
4. Repeat for each reading

Ready to start with reading #1?
