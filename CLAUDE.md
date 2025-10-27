# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This is a **learning-focused project** where the user is building senior-level intuition for reliability patterns by implementing them from scratch.

**Important for Claude Code:**
- This is NOT a production system - keep implementations focused on learning
- The user is following a step-by-step learning plan (see LEARNING_PLAN.md)
- Only implement patterns that the user has explicitly read about and is ready to build
- Make trade-offs explicit - explain what each pattern costs and what it prevents
- Keep code simple and well-commented - the goal is understanding, not perfection

## Development Commands

```bash
# Setup
npm install

# Development (hot reload)
npm run dev

# Build
npm run build

# Production
npm start

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm test -- <file>        # Run specific test file

# Linting
npm run lint
npm run lint:fix
```

## Learning Plan Structure

The user is following this sequence:

1. **Read** about a resilience pattern
2. **Discuss** the key takeaways and design decisions
3. **Implement** that specific pattern together
4. **Test** and experiment with config values
5. **Document** the trade-offs and learnings
6. **Move to next pattern**

When the user asks you to implement something, check if they've completed the corresponding reading first. If not, remind them to read it and discuss before implementing.

## Architecture (To Be Built)

The service will be a relay/proxy that demonstrates these patterns:

**Core Components (to implement in order):**
1. Retry with exponential backoff + jitter (`RetryManager`)
2. Bounded queue with backpressure (`BoundedQueue`)
3. Idempotency store (`IdempotencyStore`)
4. Dead-letter queue (`DeadLetterQueue`)
5. Worker pool (`WorkerPool`)
6. Stats collector for RED metrics (`StatsCollector`)

**API Endpoints (to build progressively):**
- `POST /relay` - Accept work with idempotency key
- `GET /health` - Service health status
- `GET /stats` - RED metrics (Rate, Errors, Duration)
- `GET /dlq` - Inspect dead-letter queue

## Recommended Config Defaults

When implementing config values, use these defaults (with explanations):

```typescript
export const config = {
  // Queue
  queueCapacity: 100,           // Small enough to hit limits in testing

  // Workers
  workerCount: 5,               // Enough parallelism to observe, small enough to debug

  // Retries
  maxRetries: 3,                // Industry standard; balances persistence vs retry storms
  initialRetryDelayMs: 100,     // Fast for learning, observable in logs
  maxRetryDelayMs: 10000,       // Caps exponential growth (10 seconds)

  // Timeouts
  requestTimeoutMs: 5000,       // Fail fast but generous for realistic work

  // Idempotency
  idempotencyTtlMs: 24 * 60 * 60 * 1000,  // 24 hours (Stripe's approach)

  // Testing
  downstreamFailureRate: 0.3,   // 30% failure for testing resilience
};
```

## Key Design Decisions to Discuss

When implementing each pattern, make sure to explain:

### 1. Retry Manager
- **Problem:** Downstream failures should be retried, but naive retry causes thundering herd
- **Solution:** Exponential backoff with full jitter
- **Trade-offs:** Increases average latency, but prevents overwhelming downstream
- **Config:** maxRetries, initialDelay, maxDelay, timeout

### 2. Bounded Queue
- **Problem:** Unbounded queues → OOM crash during traffic spikes
- **Solution:** Fixed capacity, return 429 when full
- **Trade-offs:** Rejects requests (client must retry), but prevents crash
- **Config:** queueCapacity

### 3. Idempotency Store
- **Problem:** Retries on non-idempotent operations create duplicates
- **Solution:** Cache key → result for TTL, return cached result on duplicate
- **Trade-offs:** Memory grows with unique keys (mitigated by TTL)
- **Config:** idempotencyTtlMs

### 4. Dead Letter Queue
- **Problem:** Failed messages after max retries get dropped → data loss
- **Solution:** Quarantine to DLQ for manual inspection/replay
- **Trade-offs:** Requires manual intervention, DLQ can grow
- **Config:** maxRetries (determines when item goes to DLQ)

### 5. Worker Pool
- **Problem:** Need controlled concurrency (not 1 worker, not unlimited)
- **Solution:** Fixed pool of N workers processing from queue
- **Trade-offs:** Pool can be idle (low utilization) or saturated (high latency)
- **Config:** workerCount

### 6. Stats Collector
- **Problem:** Can't tell if service is healthy without metrics
- **Solution:** Track RED metrics (Rate, Errors, Duration)
- **Trade-offs:** In-memory only (lost on restart), not production-grade
- **Config:** None (just enable/disable)

## Implementation Guidelines

When the user asks you to implement a pattern:

1. **Start with types** - Define interfaces in `src/types.ts`
2. **Then config** - Add config values to `src/config.ts` with comments explaining choices
3. **Then core logic** - Implement the pattern in `src/core/`
4. **Add extensive comments** - Explain WHY, not just WHAT
5. **Keep it simple** - No premature optimization
6. **Make it testable** - Easy to adjust config and observe behavior

## Code Style

- Use TypeScript strict mode
- Add JSDoc comments to classes explaining the pattern
- Add inline comments for non-obvious decisions
- Keep functions small and focused
- Use async/await (avoid callback hell)

## What NOT to Add (Unless Explicitly Requested)

To keep focus on learning fundamentals:
- No distributed system features (Redis, message queues)
- No persistence (everything in-memory)
- No Prometheus/Grafana integration
- No circuit breakers (advanced pattern for later)
- No authentication/authorization
- No rate limiting per client
- No Docker/Kubernetes setup

These can be added as extensions after the basics are solid.

## Testing Approach

When implementing a pattern, show the user how to test it:

```bash
# Example test for bounded queue
# Send more requests than queue capacity
for i in {1..200}; do
  curl -X POST http://localhost:3000/relay \
    -H "idempotency-key: test-$i" \
    -d '{"test": "data"}' &
done

# Should see some 429 responses
```

## Current Status

The project is in setup phase. The user will go through LEARNING_PLAN.md step by step.

**When helping:**
- Ask which reading they've completed
- Ask what insights they got from the reading
- Implement only the pattern they're currently working on
- Help them experiment with config values
- Document trade-offs in their decision log

This is a learning journey, not a race to completion. Take time to explain and experiment.
