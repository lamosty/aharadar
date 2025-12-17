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

When the runtime code is scaffolded, the typical flow will be:

1. Copy env:
   - `cp .env.example .env`
2. Boot services:
   - `./scripts/dev.sh`

## License

MIT (see `LICENSE`).


