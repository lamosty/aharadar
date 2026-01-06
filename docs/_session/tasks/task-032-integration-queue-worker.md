# Task 032 — `test(integration): cover BullMQ worker run_window end-to-end`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a Docker-backed integration test that validates our Redis + BullMQ queue wiring actually runs the pipeline worker end-to-end:

- start Postgres (pgvector) + Redis via **Testcontainers**
- apply DB migrations + seed minimal data (no network sources)
- start the BullMQ pipeline worker in-process
- enqueue a `run_window` job
- assert job completes and a digest row + digest_items are created

This complements Task 027 (Postgres-only digest smoke test) by covering the queue/worker plumbing.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0004-queue-redis-bullmq.md`
- `docs/pipeline.md`
- Code:
  - `packages/queues/src/index.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/pipeline/src/scheduler/run.ts` (`runPipelineOnce`)
  - `packages/db/migrations/*.sql`

## Scope (allowed files)

- `packages/worker/src/**/*.int.test.ts` (new integration test)
- (optional) tiny test helper colocated with the test file

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Use **Testcontainers** for integration tests.
- This test must be runnable via `pnpm test:integration` (added in Task 027).
- Avoid network and LLM keys:
  - seed **no enabled sources** (so ingest does not fetch)
  - deep summary is disabled by default (`OPENAI_DEEP_SUMMARY_MAX_CALLS_PER_RUN` defaults to 0)

## Implementation steps (ordered)

1. Start Postgres + Redis containers with Testcontainers.
2. Apply SQL migrations to Postgres.
3. Seed a minimal dataset:
   - create singleton `user`
   - create default `topic`
   - create 1–2 `sources` rows with `is_enabled=false` (to avoid connector fetch)
   - create a few `content_items` within the window and corresponding `content_item_sources`
4. Set required env vars for the worker before starting it:
   - `DATABASE_URL` to the Postgres container connection string
   - `REDIS_URL` to the Redis container connection string
   - `MONTHLY_CREDITS` to a safe high number (e.g. 100000)
   - `DEFAULT_TIER=normal` (or keep default)
5. Start the BullMQ worker via `createPipelineWorker(redisUrl)`.
6. Enqueue a `run_window` job to the `pipeline` queue:
   - payload: `{ userId, topicId, windowStart, windowEnd, mode: "normal" }`
   - set a deterministic `jobId` (include mode)
7. Wait for job completion (use BullMQ `QueueEvents` + `job.waitUntilFinished(...)`), then assert:
   - job succeeded
   - `digests` has at least 1 row for (userId, topicId, windowStart, windowEnd)
   - `digest_items` has at least 1 row for the created digest
8. Clean shutdown:
   - close worker, close db, stop containers

## Acceptance criteria

- [ ] `pnpm test:integration` runs and passes when Docker is available.
- [ ] Test does not require `.env` or any API keys.
- [ ] Test is deterministic and has reasonable timeouts (no flaky sleeps).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
pnpm test:integration
```

## Commit

- **Message**: `test(integration): cover BullMQ worker run_window end-to-end`
- **Files expected**:
  - `packages/worker/src/**/*.int.test.ts`

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
- docs/_session/tasks/task-032-integration-queue-worker.md
- docs/adr/0004-queue-redis-bullmq.md
- docs/pipeline.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test:integration

What I’m unsure about / decisions I made:
- ...
```


