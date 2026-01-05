# Opus worklist (current) — canonical `x_posts` + per-source cadence

This file is the **active queue** of tasks to hand to Claude Code Opus 4.5.

Workflow: follow `docs/workflows/ai-collab.md`.

Task specs live in: `docs/_session/tasks/` (copy/paste-ready).

## Pre-req (do once)

Commit the planning docs/ADRs first (if not already committed):

- `docs/_session/opus-implementation-x_posts-and-cadence.md`
- `docs/adr/0009-source-cadence.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/adr/0003-x-strategy-grok-signal.md` (marked superseded)

## Execution strategy

For these “core plumbing” tasks, run **one Opus instance at a time** (recommended). Parallel work is possible but not required.

Every task must end with:

- `pnpm -r typecheck`
- a CLI smoke test
- printing the **GPT‑5.2 review prompt** (see `docs/workflows/ai-collab.md`)

---

## Tasks (in order)

1. **Task 001**: cadence gating
   - `docs/_session/tasks/task-001-cadence-gating.md`
2. **Task 002**: refactor Grok provider for reuse
   - `docs/_session/tasks/task-002-grok-provider-refactor.md`
3. **Task 003**: add `x_posts` connector scaffold
   - `docs/_session/tasks/task-003-x-posts-scaffold.md`
4. **Task 004**: implement `x_posts` fetch
   - `docs/_session/tasks/task-004-x-posts-fetch.md`
5. **Task 005**: implement `x_posts` normalize
   - `docs/_session/tasks/task-005-x-posts-normalize.md`
6. **Task 006**: add minimal tests
   - `docs/_session/tasks/task-006-tests.md`

## Backlog (don’t start until x_posts + cadence land)

- Prefer canonical cluster representatives in digests (avoid tweet-as-face when canonical exists).
- URL-only “signal corroboration” boost (optional ranking feature; keep explainable/deterministic).
- Budget hard enforcement (skip paid calls when credits exhausted; tier dial-down).
- Real scheduler/queue orchestration (BullMQ + cron windows).
