# Session recap (template)

> Notes:
> - This is a handoff doc intended to be **committed**.
> - A “session” is one AI chat/window (it can span hours/days).
> - Prefer concrete facts (file paths, commands, decisions, error messages) over prose.
> - Never include secrets (API keys, tokens, full `.env` values). Use `<REDACTED>` if needed.

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-YYYY-MM-DDTHHMMZ-<slug>.md`
- **Agent/tool**: (Cursor / Claude Code / etc.)
- **Agent model**: (e.g. GPT-5.2, Claude Sonnet, etc.)
- **Date/time (local)**: (when this recap was written)
- **Session span**: (when work started → ended; can span days)
- **Repo branch**:
- **Commit range (optional)**: `<start-sha>..HEAD` (or list key commits below)
- **Context**: (why we’re writing this recap now)

## Goal(s) of the session

- Primary goal:
- Secondary goals (optional):

## What changed (high level)

Summarize meaningful outcomes (can be long if the session was long).

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
- **Key env vars** (names only; no secrets):
  - `DATABASE_URL=...`
  - `REDIS_URL=...`
  - `MONTHLY_CREDITS=...`
  - `DEFAULT_TIER=...`

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
