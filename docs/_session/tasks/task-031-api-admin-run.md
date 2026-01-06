# Task 031 — `feat(api): implement admin run endpoint (enqueue)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement `POST /api/admin/run` to trigger an **async** pipeline run for a specified window by enqueuing a BullMQ job.

This should reuse the shared queue semantics defined in `@aharadar/queues` (see Task 033).

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md` (admin run endpoint)
- `docs/adr/0004-queue-redis-bullmq.md`
- Code:
  - `packages/api/src/routes/admin.ts`
  - `docs/_session/tasks/task-033-shared-queues-package.md` (shared queue defs)
  - `packages/queues/src/index.ts` (queue name + payload + helpers)
  - `packages/shared/src/config/runtime_env.ts` (`REDIS_URL`)

## Scope (allowed files)

- `packages/api/package.json` (deps if needed)
- `packages/api/src/routes/admin.ts`
- (optional) `packages/api/src/lib/queue.ts` (tiny helper)

If anything else seems required, **stop and ask**.

## Decisions

- **Already decided (spec)**:
  - This endpoint is **admin-only** and must require API key auth.
  - Response includes `{ ok: true, jobId: "string" }`.
- **Already decided (driver)**:
  - Use shared queue definitions from `@aharadar/queues` (Task 033) to avoid drift.
  - Use a deterministic BullMQ `jobId`, including `mode`, to avoid collisions with scheduled runs:
    - `run_window:<userId>:<topicId>:<windowStart>:<windowEnd>:<mode>`

## Implementation steps (ordered)

1. Parse and validate request body:
   - `windowStart` and `windowEnd` are valid ISO strings and `windowStart < windowEnd`
   - `mode` is one of: `low|normal|high|catch_up` (default: `normal`)
2. Resolve singleton `userId` and default `topicId`.
3. Create/connect to the pipeline queue (BullMQ) using `REDIS_URL`.
4. Enqueue a `run_window` job with payload:
   - `{ userId, topicId, windowStart, windowEnd, mode }`
5. Return `{ ok: true, jobId }`.
6. Ensure the queue connection is not leaked (reuse a singleton queue object or close on shutdown).

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] `POST /api/admin/run` enqueues a job and returns `{ ok: true, jobId }`.
- [ ] Auth is enforced.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Manual smoke (requires Redis running + worker process to consume the job):
# pnpm dev:services
# node packages/worker/dist/main.js
# ADMIN_API_KEY=... DATABASE_URL=... REDIS_URL=... node packages/api/dist/main.js
# curl -X POST -H "X-API-Key: ..." -H "Content-Type: application/json" \
#   -d '{"mode":"normal","windowStart":"...","windowEnd":"..."}' \
#   http://localhost:<port>/api/admin/run
```

## Commit

- **Message**: `feat(api): implement admin run endpoint (enqueue)`
- **Files expected**:
  - `packages/api/src/routes/admin.ts`
  - (optional) `packages/api/package.json`
  - (optional) `packages/api/src/lib/queue.ts`

## Final step (required): print task report

After committing, print this block **filled in**:

```text
TASK REPORT (copy/paste to driver chat)

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-031-api-admin-run.md
- docs/api.md
- docs/adr/0004-queue-redis-bullmq.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build
- <curl smoke commands you ran>
```
