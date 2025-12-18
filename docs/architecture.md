# Aha Radar — Architecture (MVP)

## Scope and intent

This document turns the high-level product spec (`docs/spec.md`) into an implementable MVP architecture:

- concrete services and responsibilities
- concrete runtime data flow
- concrete “where does this data live?” mapping
- explicit invariants (idempotency, budget enforcement, provenance)

The MVP assumes **single-user** usage but keeps `user_id` boundaries so multi-user is feasible later.

Core principle:

- The system is **topic-agnostic**. No domain-specific logic; personalization is learned from sources + embeddings + feedback.

## High-level system diagram

```text
                  (schedule)
             ┌────────────────┐
             │ Scheduler       │
             │ (cron/timer)    │
             └───────┬────────┘
                     │ enqueue "run window"
                     v
              ┌───────────────┐         ┌──────────────────────┐
              │ Queue (Redis) │<------->│ Worker(s): Pipeline   │
              └───────────────┘         │ ingest→embed→cluster  │
                     ^                  │ triage→rank→enrich    │
                     │                  │ digest→persist        │
                     │                  └─────────┬────────────┘
                     │                            │
                     │                            v
          ┌──────────┴───────────┐         ┌──────────────────────┐
          │ API (optional MVP)   │<------->│ Postgres + pgvector   │
          │ read digests, accept │         │ canonical store       │
          │ feedback, admin run  │         └──────────────────────┘
          └──────────┬───────────┘
                     │
                     v
              ┌────────────┐
              │ CLI (MVP UI)│
              │ review queue│
              └────────────┘

External providers:
 - Source connectors: Reddit / HN / RSS / YouTube / Signals (search/trend/alerts; initial adapter can be X/Twitter search)
 - LLM provider: configurable (default provider can change; contract is task + strict JSON schemas)
```

## Components and responsibilities

### Postgres (+ pgvector)

**Source of truth** for:

- user(s), sources, cursor state
- normalized content items (with raw payloads)
- embeddings, clusters, digests, feedback events
- cost/usage accounting (`provider_calls`)

Contract-level details live in `docs/data-model.md`.

### Queue (Redis) + Worker(s)

Runs the pipeline for scheduled windows and admin-triggered runs:

- fetch & normalize from connectors
- store items and raw payloads
- compute embeddings
- dedupe + cluster
- LLM triage (Aha Score) for candidates
- compute final ranking
- deep summaries/entities for top items (budget-aware)
- create digest rows

Pipeline contract lives in `docs/pipeline.md`.

### Scheduler

Responsible for:

- generating run windows (default 3× daily, user timezone)
- enqueueing pipeline work

In MVP, scheduler can be:

- an internal cron loop inside the worker container, or
- systemd/cron calling an “admin run” endpoint/command (preferred in production for simplicity)

This is deliberately documented as an ADR choice.

### Connectors

Pluggable source-specific fetch + normalize modules.

Connector contract lives in `docs/connectors.md`.

### LLM Router + prompts

Responsible for:

- selecting `(provider, model)` per task and budget tier (derived from numeric budget pool/policy)
- calling LLMs with retries/fallbacks
- strict output validation via JSON schema
- token + cost accounting (`provider_calls`)

LLM contract lives in `docs/llm.md`.

### API (optional in MVP)

If enabled, provides:

- read-only access to digests/items
- feedback submission
- admin “run now”

API contract lives in `docs/api.md`.

### CLI (MVP)

Primary UI:

- shows latest digest items
- fast review loop: like/dislike/save/skip + open link + “why shown”

CLI contract lives in `docs/cli.md`.

## End-to-end runtime data flow (one scheduled run)

1. Scheduler determines `window_start`, `window_end`, and `budget_tier` (`low`/`normal`/`high`).
2. Scheduler enqueues a “run window” job.
3. Worker loads enabled sources for the user and executes **Ingest**:
   - calls each connector with `(cursor_json, limits)`
   - normalizes to `ContentItemDraft`
   - canonicalizes URLs, computes hashes
   - upserts `content_items`
   - persists raw payloads (retention-configurable)
   - writes `fetch_runs` and updates `sources.cursor_json`
4. Worker executes **Embed**:
   - creates embeddings for new/changed items (budget-capped)
   - writes `embeddings`
5. Worker executes **Dedupe + Cluster**:
   - hard dedupe by canonical URL hash + external IDs
   - soft dedupe and clustering using embeddings and pgvector similarity search
6. Worker executes **Digest generation**:
   - selects candidate clusters/items for the window
   - calls **LLM triage** to produce Aha Score + short reason (budget-capped)
   - computes final ranking score (triage + personalization + novelty + recency + source weighting)
   - calls deep summary/entities only for top-ranked candidates (budget-capped)
   - writes `digests` + `digest_items`
7. User reviews via CLI (or web) and submits feedback events:
   - `feedback_events` are stored
   - preference profile is updated (incrementally) for future ranking

## Core invariants (MVP must preserve these)

### Idempotency

- Re-running the same window must not create duplicates:
  - content items dedupe via `(source_id, external_id)` and/or `hash_url`
  - digests dedupe via `(user_id, window_start, window_end, mode)`

### Provenance

- Every displayed item must keep:
  - original source URL(s)
  - source type and source id
  - enough raw metadata to debug ingestion

### Budget enforcement and graceful degradation

- If budget caps are hit:
  - skip deep summaries first (deliver triage-only digest)
  - if needed, reduce triage coverage (fallback to heuristic scoring)
  - always attempt to produce _some_ digest output

### “Hard filter” posture

- The product is not “summarize everything.”
- Summarization and deep enrichment happen only **after** candidates pass relevance/novelty/aha thresholds.
