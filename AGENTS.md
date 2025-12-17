# Aha Radar — AI Agent Entry Point

This repository is primarily developed and maintained with AI coding agents (Cursor, etc.).
**When starting any new task, read this file first.**

## Fast context (TL;DR)

- **Product**: topic-agnostic personalized content aggregation + ranking (“aha radar”).
- **Core loop**: ingest → normalize → dedupe/cluster → triage (Aha Score) → rank → budget-aware enrichment → digest → feedback.
- **Budgets**: user-facing **credits**, primarily `monthly_credits`, optional `daily_throttle_credits`; tiers are `low | normal | high`.
- **Signals (MVP)**: `signal` connector exists; first adapter is **X/Twitter search via Grok** (provider swap must not require refactors).
- **Web ingestion**: generic `web` connector is **v2/deferred** (not MVP).
- **Repo status**: spec-first + scaffolding exists; runtime packages are skeletons.

## Where to read (minimal)

If you only read a few files, read these in order:

1. `docs/README.md` — docs index + decision checklist.
2. `docs/spec.md` — master spec (high-level).
3. `docs/architecture.md` — concrete system decomposition + data flow.
4. `docs/data-model.md` — DB schema contract (includes `provider_calls`).
5. `docs/pipeline.md` — stage order + ranking/budget behavior.
6. `docs/connectors.md` — connector contracts (incl. `signal` connector).
7. `docs/llm.md` — provider-agnostic LLM tasks + strict JSON schemas.
8. `docs/budgets.md` — credits budgeting + exhaustion policy.
9. ADRs: `docs/adr/*` — decisions + statuses.

## Non-negotiables (project invariants)

- **Topic-agnostic**: no domain-specific logic (finance/crypto/etc.). All ranking/prompting must be generic.
- **Provider-agnostic**:
  - LLM: never hardcode “GPT-5”; use `(provider, model)` selection and strict output schemas.
  - Signals: treat “Grok” as a configurable adapter; keep interfaces vendor-neutral.
- **Budget correctness**:
  - budgets are in credits; enforce monthly + optional daily throttle
  - when exhausted: warn + fallback to `low` (unless explicitly configured to stop)
- **No secrets committed**: never put real keys in repo; use `.env` locally.
- **No ToS violations**: no paywall bypassing, no abusive scraping.

## Repo map (current)

- `docs/` — specs + ADRs (source of truth right now).
- `docker-compose.yml` — Postgres+pgvector + Redis for local dev.
- `docker/postgres/init.sql` — enables `pgcrypto` + `vector`.
- `scripts/` — helper scripts (currently minimal).
- `packages/*` — monorepo packages (skeletons):
  - `shared` — topic-agnostic types/utilities/config/logging
  - `db` — DB client + migrations
  - `connectors` — source connectors (reddit/hn/rss/youtube/signal)
  - `llm` — provider clients + router + prompt/JSON validation
  - `pipeline` — orchestration stages
  - `worker` — BullMQ workers
  - `api` — optional HTTP API
  - `cli` — MVP UI

## How to work (AI agent operating rules)

### 1) Work in “commit-sized” chunks

Each task should be a coherent, reviewable unit:
- touches a small set of files
- updates docs/ADRs if behavior/decisions change
- leaves the repo in a consistent state

At the end of the task, **suggest a commit message** (see below).

### 2) Don’t guess; confirm contracts

- Read existing docs/code first (search + open files).
- If a decision is missing, propose options and ask.
- Keep all changes aligned to `docs/*` contracts (or update contracts first).

### 3) Consistency over cleverness

- Prefer boring, modular designs.
- Keep interfaces stable (connectors, providers, pipeline stages).
- Avoid “one-off special cases” unless documented by an ADR.

### 4) Due diligence checklist (before marking done)

- **Correctness**: new behavior matches the relevant spec/ADR.
- **Safety**: no secrets; no network calls or scraping defaults that violate ToS.
- **Types**: TypeScript strict mode; no implicit `any`.
- **Docs**: update docs when behavior/contracts change.
- **Local dev**: keep Docker Compose and scripts coherent.

## Coding conventions (baseline)

Until lint/format tooling is added, follow:
- **TypeScript**: strict, explicit types for public interfaces.
- **Naming**:
  - files: `snake_case.ts` for pipeline stages, `kebab-case` for docs if needed
  - types/interfaces: `PascalCase`
  - functions/vars: `camelCase`
- **Topic neutrality**: no finance-specific field names; use generic concepts (topic/entity/source).
- **Errors**: structured error objects; don’t swallow errors silently.

## Git/commit conventions

### Commit scope rules

- One logical change per commit.
- Separate formatting/tooling changes from behavior changes when possible.

### Conventional commits (recommended)

Use:
- `feat(<scope>): ...`
- `fix(<scope>): ...`
- `docs(<scope>): ...`
- `refactor(<scope>): ...`
- `chore(<scope>): ...`
- `test(<scope>): ...`

Examples:
- `docs(budgets): switch tiers to low/normal/high and monthly credits`
- `feat(connectors): add grok X signal adapter`
- `chore(docker): add pgvector postgres + redis compose stack`

### What to output after finishing a task

- A short summary of what changed.
- **A suggested commit message** (and optional 2–3 bullet body).

## Cursor hint (optional)

When starting a new chat in Cursor, include:

- “Read `@AGENTS.md` first and follow it.”
- “Task: <describe task>”
- “Constraints: keep topic-agnostic; provider-agnostic; credits budgets; commit-sized changes.”


