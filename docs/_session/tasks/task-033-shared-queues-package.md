# Task 033 — `refactor(queues): extract BullMQ queue definitions to shared package`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Avoid drift between API and worker by creating a small shared package that defines:

- BullMQ queue names + job names
- the `run_window` job payload type
- Redis URL → BullMQ connection parsing
- helper to create the pipeline queue

This package will be used by both `@aharadar/worker` and `@aharadar/api`.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0004-queue-redis-bullmq.md`
- Code:
  - `packages/worker/src/queues.ts`
  - `packages/worker/src/main.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`

## Scope (allowed files)

- new: `packages/queues/*` (new package)
- `tsconfig.json` (root project references)
- `packages/worker/src/queues.ts` (refactor to re-export or delegate to new package)
- `packages/worker/tsconfig.json` (project reference to `../queues`)
- `packages/worker/package.json` (dependency on `@aharadar/queues`)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Create a new shared package: `@aharadar/queues`
  - Rationale: clean layering (API should not depend on worker), and avoids queue-constant drift.
- Keep this package side-effect free (safe to import from API/worker).

## Implementation steps (ordered)

1. Create `packages/queues/` as a normal TS package:
   - `package.json` with name `@aharadar/queues`, `private: true`, and deps:
     - `bullmq` (for Queue + ConnectionOptions types)
     - `@aharadar/shared` (for `BudgetTier` type used in job payload)
   - `tsconfig.json` (composite build)
   - `src/index.ts` exporting the shared queue API
2. Export a minimal stable surface:
   - `PIPELINE_QUEUE_NAME = "pipeline"`
   - `RUN_WINDOW_JOB_NAME = "run_window"`
   - `RunWindowJobData` type
   - `parseRedisConnection(redisUrl): ConnectionOptions`
   - `createPipelineQueue(redisUrl): Queue<RunWindowJobData>`
3. Update `@aharadar/worker`:
   - add dependency on `@aharadar/queues`
   - update `packages/worker/src/queues.ts` to re-export/delegate to `@aharadar/queues`
   - update worker TS project references to include `../queues`
4. Update root `tsconfig.json` project references to include `packages/queues`.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] Worker still builds and runs (no behavior change intended).
- [ ] Queue constants/types now live in exactly one place (`@aharadar/queues`).

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
```

## Commit

- **Message**: `refactor(queues): extract BullMQ queue definitions to shared package`
- **Files expected**:
  - `packages/queues/package.json`
  - `packages/queues/tsconfig.json`
  - `packages/queues/src/index.ts`
  - `tsconfig.json`
  - `packages/worker/package.json`
  - `packages/worker/tsconfig.json`
  - `packages/worker/src/queues.ts`

## Final step (required): print task report

After committing, print this block **filled in**:

```text
TASK REPORT (copy/paste to driver chat)

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-033-shared-queues-package.md
- docs/adr/0004-queue-redis-bullmq.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build

Open questions / uncertainties:
- ...
```


