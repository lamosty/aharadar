# Aha Radar — AI Agent Entry Point

This repository is primarily developed and maintained with AI coding agents (Cursor, etc.).

## START HERE — AI agent operating prompt (read and follow)

You are an AI coding agent working in this repository.

**Before you change code**
- Read this file fully.
- Read the relevant spec/contract docs first (see **Where to read (minimal)** below).
- Confirm behavior against `docs/*` (or update the docs first if you are changing a contract).
- If present, read the latest handoff recap in `docs/sessions/recaps/` before starting work.

**How to work (non-negotiable)**
- Work in **commit-sized** chunks (small, reviewable, coherent).
- Don’t guess: **confirm contracts** in docs/code; if unclear, propose options and ask.
- Prefer consistency over cleverness: keep interfaces stable; avoid special cases unless ADR’d.
- Keep the repo safe: no secrets committed; no ToS violations; avoid abusive scraping.

**Definition of “done” for a task**
- Correctness: behavior matches the relevant spec/ADR.
- Types: TypeScript strict; no implicit `any`.
- Docs: update docs/ADRs if behavior/contracts changed.
- Local dev: keep Docker Compose/scripts coherent.

**When you finish**
- Output a short summary of what changed.
- Suggest a **conventional commit message** (and optional 2–3 bullet body).
- If chat context is running low (or the session was long), write a handoff recap to `docs/sessions/recaps/` using `docs/sessions/template.md` and **commit it**. Never include secrets (API keys, tokens, full `.env` values).
  - Naming: `docs/sessions/recaps/recap-YYYY-MM-DDTHHMMZ-<slug>.md`

## Fast context (TL;DR)

- **Product**: topic-agnostic personalized content aggregation + ranking (“aha radar”).
- **Core loop**: ingest → normalize → dedupe/cluster → triage (Aha Score) → rank → budget-aware enrichment → digest → feedback.
- **Budgets**: user-facing **credits**, primarily `monthly_credits`, optional `daily_throttle_credits`; tiers are `low | normal | high`.
- **Signals (MVP)**: `signal` connector exists; initial adapter is X/Twitter search behind a provider interface (see `docs/adr/0003-x-strategy-grok-signal.md`).
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
  - Signals: treat any vendor as a configurable adapter; keep interfaces vendor-neutral.
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
