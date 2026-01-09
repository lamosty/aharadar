# Task 120 — `docs(scheduler): spec topic-level digest cadence + digest depth`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Lock the **contract/spec** for:

- **Topic-level digest cadence** (explicit daily/weekly/custom interval per topic)
- **Digest “depth” model** (mode affects digest size + LLM spend; `high` targets **100+** items)
- **No `catch_up` mode** (backfill is scheduler behavior, not a user-facing mode)
- **No recency dominance** for “Best” ranking (recency only allowed when user explicitly chooses “Latest/Trending” views)
- **Fairness** across sources (avoid high-volume sources starving others)

This task is **docs-only**. It creates the written contract Opus will implement in follow-up tasks.

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/architecture.md` (Scheduler responsibilities)
- `docs/pipeline.md` (pipeline stage contracts)
- `docs/budgets.md` (credits + tier semantics)
- `docs/api.md` (API surface)
- Related code (for current behavior):
  - `packages/pipeline/src/scheduler/cron.ts`
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/api/src/routes/items.ts`

## Scope (allowed files)

- `docs/architecture.md`
- `docs/pipeline.md`
- `docs/budgets.md`
- `docs/api.md`
- `docs/data-model.md`

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- **No `catch_up` mode**. Modes are only: `low | normal | high`.
- **Mode affects both digest size and depth**. `high` does “more + deeper.”
- **High digest size target**: `100+` items per digest (when enough candidates exist).
- **Credits exhaustion policy**: when credits are exhausted, **stop scheduled digest generation** (no heuristic digest fallback).
- **Cadence**:
  - digest cadence is **explicit per topic** (daily/weekly/custom interval)
  - source cadence gating remains **per source config** (mode does not change it)
- **Recency**:
  - recency must not dominate “Best” ranking
  - allow recency only when user explicitly chooses “Latest” (and optionally “Trending”)
- **Catch-up old digests**: existing `digests.mode='catch_up'` should be removed (cleanup migration later).

## Spec to write (the contract)

### 1) Topic-level digest cadence (explicit)

Add a **topic-owned schedule** used by the scheduler to decide when to enqueue digests.

#### Topic digest schedule fields (contract)

Add to `topics`:

- `digest_schedule_enabled: boolean` (default `true`)
- `digest_interval_minutes: int` (default `1440` = daily)
  - allowed range (MVP): `[15, 43200]` minutes (15 minutes → 30 days)
- `digest_mode: "low"|"normal"|"high"` (default `normal`)
- `digest_depth: int` in `[0,100]` (default `50`)
  - UI “depth” slider writes this
- `digest_cursor_end: timestamptz | null`
  - scheduler cursor: “last successfully completed scheduled window end”
  - must be updated **only** for scheduled runs (not manual/admin runs)

#### Window semantics for interval schedule (contract)

For each scheduled run window:

- Window length is exactly `digest_interval_minutes`.
- Scheduler uses `digest_cursor_end` to generate the next windows.
- Backfill is done by generating **multiple consecutive windows** when the worker was down.

Algorithm (UTC):

1. `intervalMs = digest_interval_minutes * 60_000`
2. Determine `cursorEndMs`:
   - if `digest_cursor_end` exists → use it
   - else → initialize to `(floor(nowMs / 60_000) * 60_000) - intervalMs` (one full interval ending “now, rounded to minute”)
3. Generate windows:
   - while `(cursorEndMs + intervalMs) <= nowMs - 60_000`:
     - emit `{ windowStart = cursorEndMs, windowEnd = cursorEndMs + intervalMs, mode = digest_mode }`
     - cursorEndMs += intervalMs
   - cap number of emitted windows per tick: `SCHEDULER_MAX_BACKFILL_WINDOWS` (env; default 6)

Notes:

- Scheduler tick runs periodically (e.g., every 5 minutes) and **only enqueues due windows**.
- Enqueued jobs must use deterministic job IDs so repeated ticks are idempotent.

### 2) Digest size + depth model (mode + depth)

We introduce a single **topic-level “Depth” slider** (0–100) that:

- keeps the UI simple for non-technical users,
- and compiles into a set of numeric caps/limits used by the pipeline.

Mode (`low|normal|high`) selects a **preset**; depth fine-tunes within that mode.

#### Derived limits (contract)

The pipeline must compile a `DigestPlan` per run:

- `digestMaxItems` (output size)
- `candidatePoolMax` (recall ceiling; may be > digestMaxItems)
- `triageMaxCalls` (LLM triage budget; must be ≥ digestMaxItems when paid calls are allowed)
- `deepSummaryMaxCalls` (LLM deep summary budget; smaller than digestMaxItems)
- `fairnessPolicy` (diversity controls)

#### Digest size formula (initial default contract)

Let `S = enabled_sources_count` for the topic at run time.

Compute `digestMaxItems` using per-mode coefficients:

- low:
  - base=10, perSource=1, min=20, max=80
- normal:
  - base=20, perSource=2, min=40, max=150
- high:
  - base=50, perSource=5, min=100, max=300

Depth scaling:

- `depthFactor = 0.5 + (digest_depth / 100)` → range `[0.5, 1.5]`
- `raw = (base + perSource*S) * depthFactor`
- `digestMaxItems = clamp(min, max, round(raw))`

This yields `100+` for typical `high` topics even at modest source counts.

#### Triage coverage invariant (contract)

When `paidCallsAllowed=true`:

- **All selected digest items must have `triage_json`** (LLM-scored).
- If triage budget is insufficient, the system must shrink `digestMaxItems` (or refuse) rather than silently including untriaged digest items.

When `paidCallsAllowed=false` (credits exhausted; policy=`stop`):

- **Do not create a digest** for that scheduled window:
  - no `digests` row
  - no `digest_items` rows
- Scheduler should **advance the topic schedule cursor** for the window (so we do not accumulate backfill windows while budgets are exhausted).
- UI must show a clear warning (budgets/settings): “Scheduled digests paused (budget exhausted)”.

### 3) No recency dominance for “Best”

Update docs to define:

- **Best** ranking is dominated by:
  - Aha score
  - novelty
  - preference similarity
  - corroboration (optional)
  - source weights
  - diversity re-ranking
- Time is not a primary scoring component for Best.

Time can appear only as:

- a tie-breaker, and/or
- for “window coverage” sampling (ensuring the whole scheduled interval is represented),
- and/or for an explicit “Latest” view and optional “Trending” view.

### 4) Fairness (avoid starvation)

Define fairness at three layers:

1. **Candidate recall (sampling)**:
   - candidates must be sampled across sources (and optionally time buckets) so high-volume sources cannot fully occupy the pool
2. **Triage allocation**:
   - distribute a base triage quota across source types and sources, then spend remaining triage budget on globally promising candidates
3. **Final selection**:
   - apply soft diversity penalties so one source/type cannot dominate the final digest

Define “cluster counting” for fairness:

- if a candidate is a cluster with members from multiple sources, selecting that cluster counts as representing **all member sources** (for diversity accounting)

### 5) API + UI implications (document)

Docs must state:

- Topics expose digest schedule + depth fields over API.
- Web UI shows:
  - “Digest cadence” (daily/weekly/custom interval)
  - “Digest depth” (mode + depth slider)
  - derived values preview (digest items, triage calls, deep summaries)
  - estimated credits/run and projected monthly impact (best-effort estimate)
- Remove `catch_up` from API docs and UI.

## Acceptance criteria

- [ ] `docs/pipeline.md` includes topic-level digest cadence + digest plan compilation.
- [ ] `docs/budgets.md` describes how depth/mode map into triage/enrich budgets.
- [ ] `docs/architecture.md` describes scheduler backfill as behavior (not a mode).
- [ ] `docs/api.md` removes `catch_up` and documents topic digest settings endpoints.
- [ ] `docs/data-model.md` includes the new `topics.*` digest fields.

## Test plan

Docs-only:

```bash
# no tests required
```

## Commit

- **Message**: `docs(scheduler): spec topic-level digest cadence + digest depth`
- **Files expected**:
  - `docs/architecture.md`
  - `docs/pipeline.md`
  - `docs/budgets.md`
  - `docs/api.md`
  - `docs/data-model.md`
