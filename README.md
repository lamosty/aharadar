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

### Running the app

**Development mode** (with hot reload, slower initial page loads):
```bash
pnpm start         # localhost only
pnpm start:lan     # accessible on LAN (use for remote access)
```

**Production mode** (faster, no hot reload):
```bash
pnpm start:prod       # localhost only
pnpm start:prod:lan   # accessible on LAN
```

Production mode runs `next build` first, then serves optimized pages. Use this for daily use when you're not actively developing.

### Port configuration

If ports 3000/3001 are in use, configure in `.env`:
```bash
WEB_PORT=3010           # Web frontend port
API_PORT=3011           # API server port
API_URL=http://localhost:3011  # For Next.js proxy
```

Then export before running:
```bash
export WEB_PORT=3010 API_PORT=3011 API_URL=http://localhost:3011
pnpm start:lan
```

### Authentication (dev mode)

In development, you can bypass email login:
1. Go to the login page
2. Optionally enter your email (for admin access)
3. Click "Dev Bypass" button

This sets cookies and logs you in without needing email verification.

### Day-to-day workflow

- **Docker is only for Postgres/Redis** - app code runs on host
- Re-run migrations when SQL changes: `./scripts/migrate.sh`
- Clean DB/Redis: `./scripts/reset.sh` (destroys local data)

### Useful scripts

| Script | Purpose |
|--------|---------|
| `./scripts/dev.sh` | Start Postgres + Redis |
| `./scripts/migrate.sh` | Apply SQL migrations |
| `./scripts/logs.sh [service]` | Follow logs |
| `./scripts/down.sh` | Stop services |
| `./scripts/reset.sh` | Wipe + restart + migrate |

## License

MIT (see `LICENSE`).
