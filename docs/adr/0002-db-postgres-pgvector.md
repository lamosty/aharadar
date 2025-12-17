# ADR 0002: Database — Postgres + pgvector (single DB MVP)

- **Status**: Proposed
- **Date**: 2025-12-17

## Context

MVP requirements include:
- canonical storage of normalized items across connectors
- dedupe + clustering + semantic search via embeddings
- minimal operational complexity (same stack local/prod)

## Decision

Use a **single Postgres database** as the canonical store, and use **pgvector** for embedding vectors:
- Postgres version: **16+** (exact version pinned in Docker images later)
- Extensions:
  - `vector` (pgvector) for embeddings
  - `pgcrypto` for `gen_random_uuid()`
- Store:
  - raw payloads as `jsonb` (retention configurable)
  - normalized fields in relational columns
  - embeddings in `vector(<DIMS>)` columns with HNSW indexes

Migration strategy (Proposed):
- Use **SQL migrations** (portable, explicit) rather than a heavy ORM-first schema.
- If we later choose an ORM (Drizzle/Prisma), it must not obscure pgvector index details.

## Consequences

- Lowest ops overhead: one DB service plus optional Redis for queues.
- Vector operations stay in-database (no separate vector DB), simplifying deployment.
- Embedding dimension becomes a schema contract (`vector(<DIMS>)`) — changing it later requires a migration.

## Alternatives considered

- Separate vector DB (Pinecone/Weaviate): more services, higher complexity for MVP.
- SQLite + local vector index: simpler locally but diverges from production and complicates concurrency.


