# ADR 0001: Runtime — Node.js LTS + TypeScript

- **Status**: Proposed
- **Date**: 2025-12-17

## Context

The MVP must:
- run the same stack locally (Mac arm64) and in production (Hetzner x86_64) via Docker Compose
- support multiple services (API, worker, CLI) with shared types
- integrate with Postgres + pgvector, Redis queues, and LLM providers
- be maintainable and “portfolio-grade”

## Decision

Use:
- **Node.js LTS** as the runtime
- **TypeScript** for all application packages
- **Workspaces** (pnpm or npm workspaces) to share types/utilities across packages

Packaging/build details (Proposed):
- Build with `tsc` + a bundler (e.g., `tsup`) for service entrypoints
- Prefer ESM where practical, but allow CJS if ecosystem friction is high (TBD)

## Consequences

- Shared domain types and schemas reduce drift between services.
- Node + TS has strong ecosystem support for Fastify, BullMQ, Postgres drivers, and JSON schema validation.
- Multi-service monorepo becomes straightforward (shared libs, consistent tooling).

## Alternatives considered

- **Python**: strong for data pipelines but would split types across services and increase divergence risk.
- **Go**: great ops/perf, but slower iteration for prompt/schema-heavy MVP.
- **Bun**: fast DX, but higher ecosystem risk for long-lived project stability.


