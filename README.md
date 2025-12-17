# Aha Radar

Personalized, topic-agnostic content aggregation + ranking system that surfaces only high-signal / novel (“aha”) items from user-chosen sources.

## Status

This repo is currently **spec-first**. Key contracts live in `docs/`.

Start here:
- `docs/spec.md`
- `docs/README.md` (docs index)
- `AGENTS.md` (AI agent entrypoint / working rules)

## Core loop (MVP)

ingest → normalize → dedupe/cluster → triage (Aha Score) → rank → budget-aware enrichment → digest → feedback → better ranking

## Budgeting

Budgets are expressed in **credits** (not currency). The system enforces:
- `monthly_credits` (primary)
- optional `daily_throttle_credits`
- behavior tiers: `low | normal | high`

See `docs/budgets.md`.

## Local dev (planned)

The goal is “same stack locally and prod” via Docker Compose:
- Postgres + pgvector
- Redis (BullMQ)

## Install / run (dev)

### Prereqs
- Node.js (see `.nvmrc`)
- pnpm
- Docker Desktop

### First-time setup
1. Create env:
   - `cp .env.example .env`
2. Start DB + Redis:
   - `./scripts/dev.sh`
3. Apply migrations:
   - `./scripts/migrate.sh`
4. Install JS deps:
   - `pnpm install`
5. Verify the scaffold runs:
   - `pnpm dev` (runs the stub CLI)

### Day-to-day workflow
- **You do not rebuild Docker for TypeScript code changes.**
  - Docker is for Postgres/Redis.
  - App code is run from the host during dev (fast iteration).
- Re-run **migrations** when SQL changes:
  - `./scripts/migrate.sh`
- If you need a clean DB/Redis:
  - `./scripts/reset.sh` (destroys local data)

### Useful scripts
- `./scripts/dev.sh`: start Postgres + Redis
- `./scripts/migrate.sh`: apply SQL migrations
- `./scripts/logs.sh [service]`: follow logs
- `./scripts/down.sh`: stop services
- `./scripts/restart.sh`: restart services
- `./scripts/reset.sh`: wipe volumes + restart + migrate

When the runtime code is implemented, the typical flow will be:

1. Copy env:
   - `cp .env.example .env`
2. Boot services:
   - `./scripts/dev.sh`

## License

MIT (see `LICENSE`).


