# Task 124 — `feat(pipeline): compile digest plan (size+budgets) from topic settings`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Remove the hardcoded digest size defaults (e.g., `maxItems ?? 20`) and instead compile a per-run **DigestPlan** from topic settings:

- topic digest mode (`low|normal|high`)
- topic digest depth slider (`0..100`)
- enabled source count in the topic
- (and hard safety caps from env)

This task does **not** implement full fairness sampling (that’s Task 125). It only:

- makes digest size/budgets configurable and topic-aware
- ensures `high` produces **100+** items when enough candidates exist
- removes `catch_up` references from pipeline-level types

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- Code:
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/ingest.ts` (source list + topic scope)
  - `packages/shared/src/config/runtime_env.ts` (env conventions)

## Scope (allowed files)

- `packages/pipeline/src/scheduler/run.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/lib/*` (new helper module allowed)
- `packages/shared/src/config/runtime_env.ts` (env parsing; if needed)
- `.env.example`

If you think fairness logic or UI changes are required, **stop and ask** (Task 125/127).

## Decisions (already decided)

- Digest size is a function of enabled source count and mode, and `high` targets 100+.
- Mode affects both digest size and depth budgets.
- `catch_up` mode is removed.
- Credits exhaustion policy is `stop`: when credits are exhausted, do not create a digest for scheduled runs.

## Implementation requirements

### 1) Add a DigestPlan compiler

Create a helper (new file ok) e.g.:

- `packages/pipeline/src/lib/digest_plan.ts`

Export:

```ts
export interface DigestPlan {
  digestMaxItems: number;
  triageMaxCalls: number;
  deepSummaryMaxCalls: number;
  candidatePoolMax: number;
}

export function compileDigestPlan(params: {
  mode: "low" | "normal" | "high";
  digestDepth: number; // 0..100
  enabledSourceCount: number;
  // optional overrides for tests
  env?: NodeJS.ProcessEnv;
}): DigestPlan;
```

#### Default coefficients (must match Task 120)

Digest size:

- low: base=10, perSource=1, min=20, max=80
- normal: base=20, perSource=2, min=40, max=150
- high: base=50, perSource=5, min=100, max=300

Depth factor:

- `depthFactor = 0.5 + digestDepth/100` (0.5..1.5)

`digestMaxItems = clamp(min, max, round((base + perSource*S) * depthFactor))`

Triage calls:

- invariant: when paid calls are allowed, `triageMaxCalls >= digestMaxItems`
- baseline default: `triageMaxCalls = clamp(digestMaxItems, 5000, digestMaxItems * triageMultiplier)`
  - low: triageMultiplier=2
  - normal: triageMultiplier=3
  - high: triageMultiplier=5

Deep summaries:

- low: 0
- normal: min(20, round(digestMaxItems * 0.15))
- high: min(60, round(digestMaxItems * 0.3))

Candidate pool max:

- default: `candidatePoolMax = min(5000, max(500, digestMaxItems * 20))`

### 2) Add env hard caps (safety)

Add to `.env.example` (and parse where appropriate):

- `DIGEST_MAX_ITEMS_HARD_CAP` (default `300`)
- `DIGEST_TRIAGE_MAX_CALLS_HARD_CAP` (default `2000`)
- `DIGEST_DEEP_SUMMARY_MAX_CALLS_HARD_CAP` (default `60`)
- `DIGEST_CANDIDATE_POOL_HARD_CAP` (default `5000`)

Compiler must apply these hard caps as final clamps.

### 3) Wire plan into `runPipelineOnce`

In `packages/pipeline/src/scheduler/run.ts`:

- load topic from DB to get `digest_mode` and `digest_depth`
- count enabled sources for topic (`sources where topic_id and is_enabled=true`)
- compute `DigestPlan` using `compileDigestPlan`
- if `paidCallsAllowed=false` (credits exhausted) and policy=`stop`:
  - skip calling `persistDigestFromContentItems`
  - return `digest: null`
  - leave a clear log line (so operators understand why digests stopped)
- otherwise, pass `limits.maxItems = plan.digestMaxItems` into `persistDigestFromContentItems`
- extend `persistDigestFromContentItems` to accept the other plan limits (triageMaxCalls, etc.) OR (if you want to keep scope smaller) thread at least `digestMaxItems` now and reserve other knobs for Task 125.

### 4) Remove `catch_up` from pipeline types

Update:

- pipeline `DigestMode`/`PipelineRunParams` unions
- any scheduler codepaths that default to `"catch_up"`
- keep admin run UI already handled in Task 122

### 5) Keep behavior unchanged beyond sizing

Do **not** implement fairness sampling in this task.
Do **not** change ranking weights here.

This task is purely: “digest sizing becomes topic-aware and configurable”.

## Acceptance criteria

- [ ] Running the pipeline for a topic with many sources in `high` yields `>=100` digest items when enough candidates exist.
- [ ] Default scheduled runs no longer cap at 20 items unless the plan compiles to 20.
- [ ] `catch_up` is removed from pipeline types.
- [ ] Hard caps from env are enforced.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# optional manual: run a high-mode digest window and verify itemCount in UI
pnpm dev:cli -- admin:run-now --max-digest-items 200
```

## Commit

- **Message**: `feat(pipeline): compile digest plan from topic settings`
- **Files expected**:
  - `packages/pipeline/src/lib/digest_plan.ts` (new)
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/pipeline/src/stages/digest.ts` (wiring limits)
  - `.env.example`
