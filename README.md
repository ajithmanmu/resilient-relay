# Resilient Relay

A learning project for mastering reliability patterns in distributed systems.

**Status:** ✅ Steps 1-4 Complete (Core patterns implemented)
**Time Investment:** ~4 hours
**Patterns:** Retry with exponential backoff, Bounded queues, Idempotency

---

## 🎯 Project Goal

Build production-grade resilience patterns from first principles by:
1. Reading industry documentation (AWS, Google SRE, Stripe)
2. Implementing patterns in TypeScript
3. Testing and documenting trade-offs

This is **not** a tutorial copy-paste. This is **learning by building** with deep understanding of why each pattern exists and what it costs.

---

## 🏗️ What We Built (Steps 1-4)

### Core Components

**`RetryManager`** - Exponential backoff with full jitter
- Improves success rate from 70% → 99%+
- Prevents thundering herd with full jitter
- Hard timeouts (5 seconds per attempt)
- Industry standard: max 3 retries

**`BoundedQueue`** - Fixed-capacity FIFO queue
- Prevents OOM crashes (fixed memory footprint)
- Returns 429 when full (fail fast)
- Capacity: 100 items
- **Note:** Needs worker pool for true throughput control

**`IdempotencyStore`** - 24-hour TTL cache
- Prevents duplicate processing during retries
- Follows Stripe's approach (24-hour TTL)
- Detects concurrent duplicates (409 Conflict)
- Only caches successful responses

### API Endpoints

```bash
# Forward request with retry + idempotency
POST /relay
Headers: idempotency-key: unique-id-123
Body: {"data": "..."}

# Health check
GET /health
```

---

## 📚 Key Learnings

### 1. Retry Needs Jitter
Without jitter, synchronized retries create thundering herd. Full jitter spreads load evenly.

**Formula:** `delay = random(0, min(maxDelay, initialDelay * 2^attemptNumber))`

### 2. Bounded Queues Need Worker Pools
**Critical discovery through testing:**
- Bounded queue alone = capacity checking (prevents unbounded growth)
- Bounded queue + worker pool = throughput control (limits concurrent processing)

Without worker pool, Node.js processes all requests concurrently and the queue never fills up.

### 3. Only Cache Successful Responses
Failures are transient. If you cache "503 Service Unavailable", client can never retry successfully.

### 4. Idempotency is Non-Negotiable for Payments
Network retries during payment processing cause duplicate charges. Idempotency keys prevent this.

---

## 🧪 Testing

```bash
# Start server
npm run dev

# Test 1: Normal request
curl -X POST http://localhost:3000/relay \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test 2: With idempotency key
curl -X POST http://localhost:3000/relay \
  -H "Content-Type: application/json" \
  -H "idempotency-key: unique-key-1" \
  -d '{"test": "data"}'

# Test 3: Duplicate request (returns cached response)
curl -X POST http://localhost:3000/relay \
  -H "Content-Type: application/json" \
  -H "idempotency-key: unique-key-1" \
  -d '{"test": "data"}'
# Notice: Same timestamp as Test 2!

# Test 4: Traffic spike (200 concurrent requests)
for i in {1..200}; do
  (curl -X POST http://localhost:3000/relay \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}' -s) &
done
wait
```

---

## 📂 Project Structure

```
src/
├── config.ts                    # All tunable parameters
├── types.ts                     # TypeScript interfaces
├── server.ts                    # Express HTTP server
├── core/
│   ├── retry-manager.ts        # Retry with backoff + jitter
│   ├── bounded-queue.ts        # Fixed-capacity FIFO queue
│   └── idempotency-store.ts    # 24-hour TTL cache
└── downstream/
    └── flaky-client.ts          # Simulated unreliable service (30% failure)

LEARNINGS.md                     # Detailed documentation (~980 lines)
LEARNING_PLAN.md                 # Progress tracking & roadmap
```

---

## 🎓 What Makes This Valuable

### Learning from First Principles
- Built from industry documentation, not copying tutorials
- Tested and debugged real issues (discovered queue needs worker pool)
- Documented trade-offs and design decisions
- Discovered limitations through hands-on experimentation

### Demonstrates Systems Thinking
- Read industry docs first (AWS, Google SRE, Stripe)
- Implemented patterns correctly (full jitter, TTL, 409 status codes)
- Discovered limitations through testing
- Can explain when to use each pattern and why

### Real-World Applicability
These patterns are directly applicable to production systems:
- Idempotency prevents duplicate processing in payment systems
- Retry logic handles transient API failures
- Bounded queues prevent OOM crashes during traffic spikes

---

## 🔮 What's Not Implemented (Steps 5-7)

### Worker Pool (Step 5)
**Why it matters:** The missing piece for true backpressure.

Without worker pool, requests are processed synchronously and the queue never fills. With worker pool:
- Fixed number of workers (e.g., 5) continuously pull from queue
- When all workers busy AND queue full → Return 429
- True throughput control, observable backpressure

**When to implement:** To see true backpressure and controlled concurrency in action

### Dead Letter Queue (Step 6)
Quarantine failed requests after max retries for manual inspection and replay.

### Observability (Step 7)
RED metrics (Rate, Errors, Duration) for production monitoring.

---

## 📖 Further Reading

**Industry Documentation:**
- [AWS Builders' Library - Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Google SRE Book - Handling Overload](https://sre.google/sre-book/handling-overload/)
- [Stripe API - Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)

**Implementation Details:**
- See `LEARNINGS.md` for detailed documentation of each pattern
- See `LEARNING_PLAN.md` for roadmap and future enhancements

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server (hot reload)
npm run dev

# Run tests (when implemented)
npm test

# Build for production
npm run build
npm start
```

---

## 📊 Time Investment

- Step 1 (Basic server): 30 minutes
- Step 2 (Retry): 45 minutes
- Step 3 (Bounded queue): 60 minutes
- Step 4 (Idempotency): 90 minutes
- **Total: ~4 hours for production-grade patterns**

**ROI:**
- 3 production patterns mastered
- Deep understanding of trade-offs
- Hands-on experience with industry-standard reliability patterns

---

## 🎯 Next Steps

**To complete the full resilience pattern set:**
1. Implement worker pool to see true backpressure (60-90 min)
2. Add dead-letter queue for failed work (30 min)
3. Add RED metrics for observability (30 min)

**To extend and experiment:**
- Test with different configuration values
- Compare jitter strategies (no jitter vs full jitter)
- Experiment with queue sizing
- Measure performance impact of each pattern

---

## 📝 License

MIT - This is a learning project, use freely.

---

## 🙏 Acknowledgments

Patterns learned from:
- AWS Builders' Library
- Google SRE Book
- Stripe API Documentation
