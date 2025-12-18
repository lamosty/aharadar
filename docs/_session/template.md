# Session recap (template)

> Notes:
> - This is a **local-only** handoff doc (gitignored).
> - A “session” can span hours; capture enough context for the next agent to continue without guesswork.
> - Prefer concrete facts (file paths, commands, decisions, error messages) over prose.

## Session header

- **Date/time (local)**:
- **Repo branch**:
- **Context**: (why we’re writing this recap now)

## Goal(s) of the session

- Primary goal:
- Secondary goals (optional):

## What changed (high level)

Summarize the meaningful outcomes. (This can be more than 5 bullets if the session was long.)

- …

## Current state (what works / what’s broken)

- **Works**:
  - …
- **Broken / TODO**:
  - …

## How to run / reproduce (exact commands)

- **Services**:
  - `./scripts/dev.sh`
- **Migrations**:
  - `./scripts/migrate.sh`
- **Run-now / CLI**:
  - `pnpm dev:cli -- admin:run-now`
  - `pnpm dev:cli -- inbox`
- **DB inspection** (optional):
  - include exact `psql` queries if useful
- **Key env vars** (names only; no secrets):
  - `DATABASE_URL=...`
  - `REDIS_URL=...`
  - `MONTHLY_CREDITS=...`
  - `DEFAULT_TIER=...`
  - signal provider vars if relevant (e.g. `GROK_BASE_URL`, `GROK_API_KEY`, `SIGNAL_GROK_MODEL`, etc.)

## Relevant contracts (what we relied on)

- `docs/<file>.md` sections that matter
- Any ADRs referenced

## Key files touched (high-signal only)

- `path/to/file` — why it matters

## Commit log (what to look at)

- Recent commits since last recap:
  - `abcd123 feat(...): ...`
  - `efgh456 fix(...): ...`

## What’s next (ordered)

1. Next task…
2. Next task…
3. Next task…

## Open questions / decisions needed

- Question…

## Optional: work log (if helpful)

- Timestamped notes / gotchas / commands tried:
  - …
