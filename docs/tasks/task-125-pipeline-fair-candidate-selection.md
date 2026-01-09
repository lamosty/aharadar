# Task 125 — `feat(pipeline): fair candidate sampling + triage allocation (no starvation)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement fairness so we don’t miss great ideas from quieter sources when topics contain high-volume sources (e.g., many X accounts):

- **Candidate recall**: stratified sampling across sources (and time buckets) within the window
- **Triage allocation**: fair “exploration” budget per source type + per source, then global “exploitation”
- **Final selection**: soft diversity penalties (no single source/type dominates the digest)

Also enforce the invariant:

- when paid calls are allowed, **all selected digest items are triaged** (`triage_json != null`)

This task depends on:

- `docs/tasks/task-124-pipeline-digest-plan-sizing.md` (DigestPlan compiler and wiring)

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- `docs/tasks/task-124-pipeline-digest-plan-sizing.md`
- Code:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/scoring/novelty.ts`

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/rank.ts` (only if needed for diversity penalties)
- `packages/pipeline/src/lib/*` (new helper modules allowed)
- `packages/pipeline/src/stages/digest.int.test.ts` (add/extend tests)

If you need UI/API/schema changes, **stop and ask**.

## Decisions (already decided)

- Fairness unit: balance by **source type** and **source id** (hierarchical).
- Clusters count as representing **all member sources** (for diversity accounting).
- No “recency dominance”: do not sort/limit candidate pools by newest-first.
- Credits exhaustion policy is `stop`: if credits are exhausted (`paidCallsAllowed=false`), do not generate a digest.

## Implementation requirements

### 1) Candidate recall: stratified sampling (required)

Replace the current “ORDER BY candidate_at desc LIMIT poolSize” with a fair sampling approach.

MVP approach (acceptable and implementable without heavy SQL):

1. Fetch a bounded superset of candidates from SQL:
   - increase the SQL `limit` to `plan.candidatePoolMax` (from Task 124)
   - **do not** order purely by `candidate_at desc`
   - order by a cheap heuristic that does not depend on recency dominance:
     - engagement (log-scaled)
     - optional: presence of title/body
     - optional: source weight
2. Build time buckets for coverage:
   - `bucketCount = clamp(3, 12, round(windowHours / 2))`
   - bucket index from candidate timestamp
3. Build per-(sourceType, sourceId, bucket) groups and sample:
   - take up to `k` candidates per group (k derived from plan + source count)
4. Merge, dedupe by candidateId, and clamp to `plan.candidatePoolMax`.

This guarantees every source can contribute candidates even if a few sources are extremely prolific.

### 2) Triage allocation: exploration + exploitation (required)

Given the sampled pool:

- Allocate triage calls in two phases:

**Phase A: exploration**

- Split a base triage budget across source types:
  - e.g., `basePerType = max(5, round(plan.triageMaxCalls * 0.1 / numTypesPresent))`
- Then within each type, allocate `basePerSource = 1..N` (at least 1 if the source has candidates).
- Pick top candidates within each group by heuristic to fill these slots.

**Phase B: exploitation**

- Remaining triage calls go to globally top heuristic candidates (excluding those already selected).

Important:

- Always ensure `triageCount >= plan.digestMaxItems` when `paidCallsAllowed=true`.

### 3) Ensure all selected digest items are triaged (required)

Change selection logic:

- Only select digest items from the set of candidates that have triage results.
- If triage results are fewer than `digestMaxItems` due to errors, **shrink the digest** to `triagedCount` and log a warning.

Exception:

- If `paidCallsAllowed=false` (policy=`stop`), do not generate a digest and clearly log.

### 4) Final selection diversity (required)

Apply a soft penalty during selection to avoid dominance:

- Greedy select from ranked candidates, but adjust score based on how many items already selected from:
  - the same `source_type`
  - the same `source_id`
  - for clusters: all member sources count as represented

Example penalty (tunable):

- `adjusted = score / (1 + alphaType * countType + alphaSource * countSource)`
  - default `alphaType=0.15`, `alphaSource=0.05`

Do not enforce hard “max per source” caps in MVP.

### 5) Logging / observability (recommended)

Add summary logs for each digest run:

- candidatePoolSize
- triagedCount
- digestItemsCount
- distribution across source types (counts)
- distribution across sources (top 5 counts)

## Acceptance criteria

- [ ] High-volume sources can no longer starve quieter sources: digests show a mix when multiple sources are configured.
- [ ] When `paidCallsAllowed=true`, all selected digest items have triage_json (except rare failure where digest shrinks).
- [ ] No candidate pool logic relies on “newest first”.
- [ ] `pnpm test` passes.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# integration-ish: run a digest with multiple sources and inspect digest_items distribution
pnpm dev:cli -- admin:digest-now --max-items 120
```

## Commit

- **Message**: `feat(pipeline): fair candidate sampling and triage allocation`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - (optional) `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.int.test.ts`
  - `packages/pipeline/src/lib/*` (new helpers)
