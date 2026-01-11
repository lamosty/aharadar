# Task 123 — `feat(worker): schedule digests by topic cadence (+ backfill)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Replace the current global scheduler windowing (`fixed_3x_daily` / `since_last_run`) with **topic-level digest cadence**:

- each topic has `digest_interval_minutes`, `digest_mode`, `digest_schedule_enabled`, `digest_cursor_end`
- scheduler tick enqueues due windows per topic
- scheduler supports bounded backfill (internal reliability), without any `catch_up` mode

This task depends on:

- `docs/tasks/task-121-db-topic-digest-settings.md` (DB fields)
- `docs/tasks/task-122-api-topic-digest-settings.md` (mode list; catch_up removed)

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- Code:
  - `packages/worker/src/main.ts` (scheduler tick loop)
  - `packages/pipeline/src/scheduler/cron.ts` (window generation)
  - `packages/queues/src/index.ts` (job payload types)
  - `packages/worker/src/workers/pipeline.worker.ts` (job processor)

## Scope (allowed files)

- `packages/pipeline/src/scheduler/cron.ts`
- `packages/pipeline/src/scheduler/cron.test.ts` (update/add tests)
- `packages/queues/src/index.ts`
- `packages/worker/src/main.ts`
- `packages/worker/src/workers/pipeline.worker.ts`
- `.env.example` (add new env vars; create file if missing)
- `README.md` / `scripts/dev.sh` (only if needed to keep env docs coherent)

If you need to change API/web UI in this task, **stop and ask**.

## Decisions (already decided)

- Topic digest cadence is explicit per topic; source cadence gating remains per source config.
- No `catch_up` mode; backfill is internal scheduler behavior.
- Windows are fixed-length intervals (exactly `digest_interval_minutes`).

## Scheduler behavior (required)

### 1) Env config

Add env vars (document in `.env.example`):

- `SCHEDULER_TICK_MINUTES` (existing; keep)
- `SCHEDULER_MAX_BACKFILL_WINDOWS` (new; default `6`)
  - caps how many windows scheduler will enqueue per topic per tick
- `SCHEDULER_MIN_WINDOW_SECONDS` (optional; default `60`)
  - minimum window duration check (mostly for safety)

### 2) Window generation algorithm (topic-based)

Implement in `packages/pipeline/src/scheduler/cron.ts`:

- replace `SchedulerWindowMode` logic; keep `parseSchedulerConfig` but make it parse only the new env fields (or keep old env as deprecated but do not use it)
- update `generateDueWindows({ userId, topicId, now })` to:
  1. Load topic row and read:
     - `digest_schedule_enabled`
     - `digest_interval_minutes`
     - `digest_mode`
     - `digest_cursor_end`
  2. If schedule disabled → return `[]`.
  3. Compute `intervalMs` and initialize cursor:
     - if `digest_cursor_end` exists: `cursorEndMs = Date(digest_cursor_end).getTime()`
     - else: `cursorEndMs = floor(nowMs / 60_000)*60_000 - intervalMs`
  4. Generate up to `SCHEDULER_MAX_BACKFILL_WINDOWS` windows where:
     - windowStart = cursorEndMs
     - windowEnd = cursorEndMs + intervalMs
     - only emit if `windowEnd <= nowMs - 60_000` (1-minute lag)
     - advance cursorEndMs per emitted window
  5. Return windows with `mode: topic.digest_mode`.

### 3) Deterministic job IDs and idempotency

Update worker scheduler loop (`packages/worker/src/main.ts`) to:

- include `mode` in the job ID (since mode affects digest size/depth)
- include sanitized `windowStart` and `windowEnd` as before

Example jobId format:

`run_window_<userId>_<topicId>_<windowStart>_<windowEnd>_<mode>`

Also handle duplicate jobId gracefully:

- If BullMQ throws “job already exists”, log debug and continue (idempotent tick behavior).

### 4) Updating `digest_cursor_end` only after successful scheduled runs

We must ensure manual/admin runs do not move the scheduler cursor.

Add to the queue job payload:

```ts
trigger?: "scheduled" | "manual"; // default "scheduled" for scheduler tick; "manual" for admin run
```

Scheduler enqueues `trigger:"scheduled"`.

In `packages/worker/src/workers/pipeline.worker.ts` after a successful run:

- if `job.data.trigger === "scheduled"`:
  - update topic `digest_cursor_end` to `job.data.windowEnd`
  - ensure monotonicity: set cursor to max(existing, windowEnd) (defensive)

Notes:

- This must advance the cursor even if the digest was skipped due to exhausted credits (policy=`stop`), otherwise the scheduler will get stuck re-enqueuing the same window.

Do **not** update cursor for `manual` runs.

## Tests (required)

Update/add tests in `packages/pipeline/src/scheduler/cron.test.ts`:

- schedule disabled → no windows
- no cursor_end → initializes to now-rounded-to-minute minus interval
- cursor_end present → starts from cursor_end
- backfill generates multiple consecutive windows, capped by `SCHEDULER_MAX_BACKFILL_WINDOWS`
- mode propagated from topic.digest_mode

## Acceptance criteria

- [ ] Scheduler enqueues topic windows based on each topic’s interval settings.
- [ ] Backfill works (bounded).
- [ ] No `catch_up` references remain in scheduler/queue types.
- [ ] Only scheduled runs advance `topics.digest_cursor_end`.
- [ ] `pnpm test` passes.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# manual smoke
pnpm dev:services
pnpm dev:worker
# watch logs for "Enqueued job"
```

## Commit

- **Message**: `feat(worker): schedule digests by topic cadence`
- **Files expected**:
  - `packages/pipeline/src/scheduler/cron.ts`
  - `packages/pipeline/src/scheduler/cron.test.ts`
  - `packages/queues/src/index.ts`
  - `packages/worker/src/main.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `.env.example`
