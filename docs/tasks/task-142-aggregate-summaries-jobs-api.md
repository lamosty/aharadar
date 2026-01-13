# Task 142 — `feat(aggregate-summaries): jobs + API + pipeline wiring`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Wire aggregate summaries end‑to‑end:

- enqueue summary jobs after digest runs (if enabled)
- support manual summary generation (digest + inbox)
- expose summary data via API

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-141-aggregate-summaries-core.md`
- `docs/pipeline.md`
- Code:
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/queues/src/index.ts`
  - `packages/api/src/routes/digests.ts`
  - `packages/api/src/routes/items.ts`

## Decisions (approved)

1) **Auto digest summaries** are enabled **per topic** (`aggregate_summary_v1.enabled`).
2) **Low tier disables** auto summaries by default.
3) **Input pruning** drops lowest **Aha Score** items if max input is exceeded.
4) **Inbox summaries** require explicit `since/until`; allow `topic=all` with explicit range.
5) **Credits guardrail**: skip if credits exhausted or if estimated call would exceed remaining credits.
6) **Digest status**: skip auto summaries for `status='failed'` digests.

## Scope (allowed files)

- Pipeline:
  - `packages/pipeline/src/stages/aggregate_summary.ts` (new)
  - `packages/pipeline/src/scheduler/run.ts`
- Worker/queue:
  - `packages/queues/src/index.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
- API:
  - `packages/api/src/routes/digests.ts`
  - `packages/api/src/routes/summaries.ts` (new)
  - `packages/api/src/lib/db.ts` (if route wiring needed)
- Shared types:
  - `packages/shared/src/types/aggregate_summary.ts`
- Tests (if needed):
  - `packages/pipeline/src/stages/digest.int.test.ts`

## Implementation requirements

### 1) Summary generation stage (required)

Create a new pipeline helper `aggregate_summary.ts` that:

- Accepts a scope (digest or inbox) and builds an input payload:
  - `item_id`, `title`, `body_snippet`, `triage_reason`, `ai_score`, `aha_score`, `source_type`, `published_at`, `url`
  - For clusters: include `cluster_member_count` and top 1–3 member titles/sources
- Enforces caps (env‑configurable):
  - `AGG_SUMMARY_MAX_INPUT_CHARS`
  - `AGG_SUMMARY_MAX_ITEM_BODY_CHARS`
  - `AGG_SUMMARY_MAX_ITEMS`
- If still too large, drop **lowest Aha Score** items first
- Records debug stats in `meta_json`
- Calls LLM task `aggregate_summary`
- Writes `aggregate_summaries` row (status + tokens + costs)
- Before calling, estimate credits (based on max input/output tokens) and skip if it would exceed remaining credits.

### 2) Queue job (required)

Add job type:
- `RUN_AGGREGATE_SUMMARY_JOB_NAME`
- Payload includes: `scopeType`, `scopeHash`, `digestId?`, `topicId?`, `since?`, `until?`, `view?`

Worker should:
- Load LLM settings
- Call the new aggregate summary stage
- Update `aggregate_summaries` with status

### 3) Auto enqueue after digest (required)

In `runPipelineOnce`, after digest creation:

- Load topic config (`aggregate_summary_v1.enabled`)
- If enabled and tier is normal/high and `paidCallsAllowed=true`, enqueue digest summary job
- If disabled or tier low, skip
- If digest is `status='failed'`, skip

### 4) API endpoints (required)

Add routes:

- `POST /summaries/digest/:digestId`
  - Creates/updates summary row (pending) and enqueues job
- `POST /summaries/inbox`
  - Body: `{ topicId | "all", since, until }` (explicit range required)
  - Creates/updates summary row (pending) and enqueues job
- `GET /summaries/:id`
  - Returns summary row + status

Extend `GET /digests/:id` to include summary if present (scope digest).

### 5) Budgets + credits (required)

- If credits exhausted (`paidCallsAllowed=false`), mark summary as `skipped` with reason
- If estimated credits would exceed remaining budget, mark as `skipped` with reason
- Record `provider_calls` with purpose `aggregate_summary`

## Acceptance criteria

- [ ] Aggregate summary jobs can be enqueued and processed
- [ ] Digest auto summaries run only when topic config enabled and tier not low
- [ ] Inbox summary can be triggered manually via API
- [ ] API returns summary for digest detail when available
- [ ] Summary rows include input/output token counts and cost estimate

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit (suggested)

- **Message**: `feat(aggregate): enqueue + generate aggregate summaries`
- **Files expected**:
  - `packages/pipeline/src/stages/aggregate_summary.ts`
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/queues/src/index.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/api/src/routes/digests.ts`
  - `packages/api/src/routes/summaries.ts`
  - `packages/shared/src/types/aggregate_summary.ts`
