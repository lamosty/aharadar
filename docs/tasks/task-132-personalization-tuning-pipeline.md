# Task 132 — `feat(pipeline): preference-biased sampling + triage allocation + tuning overrides`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Improve personalization **without increasing LLM call volume** by:

- Using embedding-derived preference similarity to **prioritize which items get triaged**
- Using the same preference signal to **bias fair sampling** (still fairness-first)
- Increasing personalization impact in ranking (configurable `wPref`)
- Speeding up source/author preference learning (configurable `feedbackWeightDelta`)

All behavior must be **configurable per topic** (via `topics.custom_settings`) with safe defaults.

## Read first (required)

- `AGENTS.md`
- `docs/pipeline.md`
- `docs/data-model.md`
- `docs/spec.md`
- Code:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/lib/fair_sampling.ts`
  - `packages/pipeline/src/lib/triage_allocation.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/db/src/repos/feedback_events.ts`
  - `packages/db/src/repos/topics.ts`
  - `packages/db/migrations/*` (topics custom_settings)

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/lib/fair_sampling.ts`
- `packages/pipeline/src/lib/triage_allocation.ts`
- `packages/pipeline/src/stages/rank.ts`
- `packages/db/src/repos/feedback_events.ts`
- `packages/db/migrations/0021_topics_custom_settings.sql` (new)
- `packages/db/src/repos/topics.ts`
- `packages/db/src/db.ts` (if you need to expose new topic fields)
- `packages/shared/src/types/*` (new tuning types/helpers)
- `packages/shared/src/index.ts` (export new types)
- Tests:
  - `packages/pipeline/src/stages/digest.int.test.ts`
  - `packages/pipeline/src/stages/rank.test.ts`

If you need UI changes, **stop and ask** (that’s Task 133). Schema changes for topic custom_settings are in scope.

## Decisions (approved)

1. **Where to store tuning settings** in `custom_settings`:
   - Use `topics.custom_settings.personalization_tuning_v1` (object)
2. **Default values** (should change behavior by default):
   - `prefBiasSamplingWeight` (sampling bias): **0.15**
   - `prefBiasTriageWeight` (triage bias): **0.20**
   - `rankPrefWeight` (wPref): **0.25** (current default is 0.15)
   - `feedbackWeightDelta`: **0.12** (current default is 0.10)
3. **Clamp ranges** (safety):
   - `prefBiasSamplingWeight`: 0.0–0.5
   - `prefBiasTriageWeight`: 0.0–0.5
   - `rankPrefWeight`: 0.0–0.5
   - `feedbackWeightDelta`: 0.0–0.2
4. **Scope**:
   - Per‑topic (stored in `topics.custom_settings`)

## Implementation requirements

### 1) Topic custom_settings + tuning schema (required)

Add topic-scoped storage and a shared tuning type + parser (clamp + defaults):

- Add a migration to extend `topics` with:
  - `custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb`
- Update `packages/db/src/repos/topics.ts` to read/write `custom_settings`
- New type in `packages/shared/src/types/*` (e.g. `personalization_tuning.ts`):
  - `PersonalizationTuningV1` with a `schema_version` (string literal) and numeric fields
  - `PersonalizationTuningResolved` (post-parse, all fields filled)
- Add a helper `parsePersonalizationTuning(raw: unknown): PersonalizationTuningResolved`
  - Accepts `topics.custom_settings.personalization_tuning_v1` if present
  - Falls back to **defaults** when missing/invalid
  - Clamps values to the approved ranges

Export from `packages/shared/src/index.ts`.

### 2) Compute preference score per candidate (required)

In `packages/pipeline/src/stages/digest.ts`:

- Compute `preferenceScore = clamp(-1, 1, (positiveSim ?? 0) - (negativeSim ?? 0))`
- Include it in:
  - `SamplingCandidate` (fair sampling)
  - `TriageCandidate` (triage allocation)

If `positiveSim` / `negativeSim` are null, score must be 0 (no bias).

### 3) Preference‑biased fair sampling (required)

In `packages/pipeline/src/lib/fair_sampling.ts`:

- Extend `SamplingCandidate` to include `preferenceScore?: number`
- Extend `StratifiedSampleParams` with `preferenceBiasWeight?: number`
- When sorting **within groups** and when trimming to `maxPoolSize`, sort by:

```
combined = heuristicScore + preferenceBiasWeight * preferenceScore
```

- If `preferenceBiasWeight` is 0 or missing, behavior must be identical to current.

### 4) Preference‑biased triage allocation (required)

In `packages/pipeline/src/lib/triage_allocation.ts`:

- Extend `TriageCandidate` to include `preferenceScore?: number`
- Extend `TriageAllocationParams` with `preferenceBiasWeight?: number`
- Use `combined = heuristicScore + preferenceBiasWeight * preferenceScore` to:
  - rank candidates within each source (exploration)
  - rank global candidates (exploitation)
  - rank in the “triage all” fast‑path

Exploration guarantees **must remain** (minimum per source/type), only ordering changes.

### 5) Apply tuning to ranking + feedback weights (required)

In `packages/pipeline/src/stages/digest.ts`:

- Load topic settings and parse tuning:
  - Fetch the topic row (already done for decay hours) and read `custom_settings`
  - Parse with `parsePersonalizationTuning`
- Pass `weights: { wPref: tuning.rankPrefWeight }` into `rankCandidates`
- Pass `feedbackWeightDelta` into `feedbackEvents.computeUserPreferences` (see below)

In `packages/db/src/repos/feedback_events.ts`:

- Allow `computeUserPreferences` to accept an optional `weightDelta` parameter
- Use this instead of the hardcoded `WEIGHT_DELTA`
- Preserve the existing clamp range (0.5–2.0)

### 6) Logging/observability (recommended)

Add a compact log line in digest run summarizing effective tuning values so we can debug
(avoid logging entire `custom_settings`).

### 7) Tests (required)

- `packages/pipeline/src/stages/digest.int.test.ts`:
  - Add unit tests for `stratifiedSample` showing preference bias changes ordering
  - Add unit tests for `allocateTriageCalls` showing preference bias changes ordering
- `packages/pipeline/src/stages/rank.test.ts`:
  - Add test that `wPref` override affects score as expected
- Ensure existing tests pass (including new migration)

## Acceptance criteria

- [ ] No additional LLM calls are introduced (same triage budget as before)
- [ ] When tuning weights are unset, behavior matches current defaults
- [ ] Preference bias reorders candidates but **does not** remove exploration coverage
- [ ] `wPref` and `feedbackWeightDelta` can be overridden via topic custom settings
- [ ] All tests pass: `pnpm -r typecheck` and `pnpm test`

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `feat(pipeline): preference-biased selection + tuning overrides`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/lib/fair_sampling.ts`
  - `packages/pipeline/src/lib/triage_allocation.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/db/src/repos/feedback_events.ts`
  - `packages/db/migrations/0021_topics_custom_settings.sql`
  - `packages/db/src/repos/topics.ts`
  - `packages/shared/src/types/*`
  - `packages/shared/src/index.ts`
  - `packages/pipeline/src/stages/digest.int.test.ts`
  - `packages/pipeline/src/stages/rank.test.ts`
