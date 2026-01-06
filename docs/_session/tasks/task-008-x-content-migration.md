# Task 008 — `docs(connectors): document migration strategy for legacy signal-stored X content`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Write down an explicit **migration/backfill stance** now that `x_posts` exists:

- what we do (and do not) support for existing “signal-stored X” content
- recommended approach for local/dev: **reset + re-ingest** (preferred, no compat hacks)
- what would be required if we later decide to add a one-off backfill tool

This task is intentionally **docs-only** unless the driver explicitly requests a backfill tool.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (signal vs x_posts)
- `docs/data-model.md` (where content_items live; no migration scaffolding)
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (What’s next #2)
- Code (reference only; do not change unless explicitly requested):
  - `packages/cli/src/commands/admin.ts` (existing signal debug/backfill helpers)

## Scope (allowed files)

- `docs/connectors.md`
- `docs/migrations/migration-signal-x-to-x-posts.md` (new)

If you think you need to change code (CLI/db/pipeline), **stop and ask** before editing.

## Decisions (stop and ask if unresolved)

- Confirm the default stance:
  - **Default**: “reset local DB + re-ingest as `x_posts`” (no backfill tool yet).
  - Optional later: add a one-off backfill CLI if we decide we need it.

## Implementation steps (ordered)

1. Add a new short doc: `docs/migrations/migration-signal-x-to-x-posts.md` containing:
   - the problem statement (“old X content may exist as `signal_*` items”)
   - recommended dev approach (reset/re-ingest) with exact commands:
     - `./scripts/reset.sh`
     - `./scripts/migrate.sh`
     - recreate sources (including `x_posts`)
   - explicitly state: **no backfill story is supported by default** (per repo velocity rule)
   - include “If we later need backfill…” as a short outline (what it would do, and why it’s risky)
2. Update `docs/connectors.md` in the `x_posts` ↔ `signal` relationship section:
   - add a brief note pointing to the migrations doc
   - keep it topic-agnostic and vendor-agnostic

## Acceptance criteria

- [ ] A clear migration stance is documented (reset/re-ingest default; no backfill by default).
- [ ] The doc includes copy/paste commands for local/dev reset + re-ingest.
- [ ] `pnpm -r typecheck` still passes (should be no code changes).

## Test plan (copy/paste)

```bash
pnpm -r typecheck
```

## Commit

- **Message**: `docs(connectors): document migration strategy for legacy signal-stored X content`
- **Files expected**:
  - `docs/connectors.md`
  - `docs/migrations/migration-signal-x-to-x-posts.md`

## Final step (required): print GPT‑5.2 review prompt

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-008-x-content-migration.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
