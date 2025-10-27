# Resilient Relay

A learning-focused project to deeply understand how resilient systems stay correct and available under retries, spikes, and partial outages.

## Project Status

🚧 **Currently in setup phase** - See [LEARNING_PLAN.md](./LEARNING_PLAN.md) for the learning roadmap.

## What This Project Teaches

1. **Idempotency and deduplication** - How to safely retry without creating duplicate side effects
2. **Bounded queues and backpressure** - How to stop a traffic spike from taking down the service
3. **Timeouts, retry strategy, and exponential backoff with jitter** - How to avoid retry storms
4. **Dead-letter queues (DLQ)** - How to quarantine "poison" work without silently dropping it
5. **Basic observability** - How to expose stats/metrics to prove the service is healthy

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Follow the learning plan

Open [LEARNING_PLAN.md](./LEARNING_PLAN.md) and start with Phase 1: Reading.

After each reading, you'll implement that specific pattern step-by-step.

### 3. Run the service (once implemented)

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start

# Tests
npm test
```

## Project Structure

```
resilient-relay/
├── LEARNING_PLAN.md          # Step-by-step learning roadmap
├── src/
│   ├── server.ts             # Main entry point (you'll create this)
│   ├── config.ts             # Configuration values
│   ├── types.ts              # TypeScript interfaces
│   ├── core/                 # Core resilience components
│   │   ├── retry-manager.ts
│   │   ├── bounded-queue.ts
│   │   ├── worker-pool.ts
│   │   ├── idempotency-store.ts
│   │   ├── dead-letter-queue.ts
│   │   └── stats-collector.ts
│   ├── api/                  # HTTP controllers
│   │   ├── relay.controller.ts
│   │   └── health.controller.ts
│   └── downstream/
│       └── flaky-client.ts   # Simulated flaky downstream
└── package.json
```

## Learning Resources

- [AWS Builders' Library — Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Google SRE Book — Handling Overload](https://sre.google/sre-book/handling-overload/)
- [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [AWS SQS — Dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [Grafana RED Method](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/)

## Philosophy

This is a **learning project**, not a production system. The goal is to:
- Build each pattern from scratch to understand how it works
- Make trade-offs explicit (document what each pattern costs)
- Keep it simple enough to experiment with (adjust timeouts, queue sizes, retry counts)
- Build interview-ready explanations of why these patterns exist

**We will NOT add:**
- Production-grade monitoring (Prometheus/Grafana)
- Distributed system complexity (multiple processes, persistence)
- Advanced patterns (circuit breakers, rate limiting) until basics are solid

Start with [LEARNING_PLAN.md](./LEARNING_PLAN.md) to begin your learning journey.
