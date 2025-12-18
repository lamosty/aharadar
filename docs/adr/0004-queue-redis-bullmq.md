# ADR 0004: Job Queue — Redis + BullMQ

- **Status**: Proposed
- **Date**: 2025-12-17

## Context

The pipeline needs:

- background execution (scheduled runs, admin “run now”)
- concurrency across sources and stages
- retries with backoff and failure visibility

The spec recommends Redis + BullMQ but allows a Postgres-only queue to reduce services.

## Decision

Use **Redis + BullMQ** for MVP job orchestration.

Design constraint:

- keep a small internal abstraction around “enqueue/run job” so we can migrate to a Postgres queue later if we decide to remove Redis.

## Consequences

- Adds a Redis service, but enables robust retries, rate-limited workers, and clear job semantics.
- Easier to separate “ingest” vs “enrich” vs “digest” work and scale workers independently.

## Alternatives considered

- **Postgres-only queue**: fewer services, but more custom implementation work and weaker job UX (unless adopting a mature library).
- **External managed queues (SQS, etc.)**: more ops complexity for a self-hosted MVP.
