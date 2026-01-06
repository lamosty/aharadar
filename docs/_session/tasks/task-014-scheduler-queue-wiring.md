# Task 014 — `feat(worker): wire BullMQ scheduler + pipeline runner`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the first real scheduler/queue orchestration slice:

- BullMQ queue definitions (Redis-backed)
- worker that runs the pipeline for an enqueued `(topic_id, window_start, window_end)`
- a minimal scheduler loop that generates windows and enqueues jobs

Keep it small, deterministic, and aligned with MVP constraints (single-user is OK, but preserve `user_id` boundaries).

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture.md` (Scheduler + Queue + Worker responsibilities)
- `docs/pipeline.md` (stage order + window semantics)
- `docs/README.md` (Scheduling & windows decisions are not fully locked)
- `docs/adr/0004-queue-redis-bullmq.md` (status is Proposed; confirm before implementing)
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (backlog item)
- Code:
  - `packages/pipeline/src/scheduler/run.ts` (`runPipelineOnce`)
  - `packages/pipeline/src/scheduler/cron.ts` (currently stub)
  - `packages/worker/src/main.ts` (currently stub)
  - `packages/worker/src/queues.ts` + `packages/worker/src/workers/*` (stubs)

## Scope (allowed files)

- `packages/worker/package.json` (add BullMQ deps)
- `packages/worker/src/main.ts`
- `packages/worker/src/queues.ts`
- `packages/worker/src/workers/ingest.worker.ts`
- `packages/worker/src/workers/digest.worker.ts`
- `packages/worker/src/workers/enrich.worker.ts` (optional; can be deferred)
- `packages/pipeline/src/scheduler/cron.ts`

If you think you need to change Docker, DB schema, or many other packages, **stop and ask**.

## Decisions (stop and ask if unresolved)

Before coding, confirm with the driver:

- **Queue choice**: adopt ADR 0004 (Redis + BullMQ) now?
- **Window semantics** (from `docs/README.md`):
  - fixed windows (e.g., 3× daily) vs “since last run”
- **Default schedule**:
  - fixed 3× daily vs templates (defer templates if needed)

If these are not decided, STOP and ask.

## Implementation steps (ordered)

1. Add BullMQ dependencies to `@aharadar/worker`.
2. Implement a queue (MVP suggestion):
   - queue name: `pipeline`
   - job name: `run_window`
   - payload: `{ userId, topicId, windowStart, windowEnd, mode? }`
3. Implement worker handler that:
   - loads DB using `DATABASE_URL`
   - calls `runPipelineOnce(db, { userId, topicId, windowStart, windowEnd, mode })`
   - logs a concise summary (ingest/embed/cluster/digest counts)
4. Implement `packages/pipeline/src/scheduler/cron.ts`:
   - generate the next due window(s) deterministically
   - enqueue `run_window` jobs via the queue
   - ensure idempotency: re-enqueueing the same window should not create duplicate digests (DB uniqueness already enforces this)
5. Keep the first slice simple:
   - single-user is acceptable for MVP (e.g., schedule only the singleton user and their default topic), but preserve user/topic ids in job payload.

## Acceptance criteria

- [ ] A worker process can run and successfully process a queued `run_window` job.
- [ ] The scheduler enqueues jobs for due windows.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# In one terminal: start services
pnpm dev:services

# In another terminal: run the worker (adjust command per implementation)
node packages/worker/dist/main.js

# Then confirm a digest exists:
pnpm dev:cli -- inbox
```

## Commit

- **Message**: `feat(worker): wire BullMQ scheduler + pipeline runner`
- **Files expected**:
  - `packages/worker/package.json`
  - `packages/worker/src/main.ts`
  - `packages/worker/src/queues.ts`
  - `packages/worker/src/workers/ingest.worker.ts`
  - `packages/worker/src/workers/digest.worker.ts`
  - `packages/pipeline/src/scheduler/cron.ts`

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
- docs/_session/tasks/task-014-scheduler-queue-wiring.md
- docs/adr/0004-queue-redis-bullmq.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <commands you ran>

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```


