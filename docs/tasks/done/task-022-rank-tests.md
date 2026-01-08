# Task 022 — `test(pipeline): cover rank scoring + weights parsing`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add hermetic unit tests for the ranking math and explainability features so score changes are intentional and reviewable:

- `parseSourceTypeWeights`
- `computeEffectiveSourceWeight` (incl. clamping)
- `rankCandidates` (triage vs heuristic, signal/novelty boosts, source-weight multiplier, deterministic sorting)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (ranking + explainability expectations)
- Code:
  - `packages/pipeline/src/stages/rank.ts`

## Scope (allowed files)

- `packages/pipeline/src/stages/rank.ts`
- `packages/pipeline/src/stages/rank.test.ts` (new)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Default weights in `rankCandidates` are:
  - `wAha=0.8`, `wHeuristic=0.15`, `wPref=0.05`, `wSignal=0.05`, `wNovelty=0.05`
- Source weights:
  - type weights parsed from `SOURCE_TYPE_WEIGHTS_JSON` (missing types default to 1.0)
  - per-source weight from `sources.config_json.weight` (missing defaults to 1.0)
  - `effective_weight = clamp(type_weight * source_weight, 0.1, 3.0)`

## Implementation steps (ordered)

1. Add unit tests for `parseSourceTypeWeights`:
   - missing env var → empty `Map`
   - invalid JSON → empty `Map`
   - non-object JSON (array/null/string/number) → empty `Map`
   - object with mixed values → keep only finite numbers
2. Add unit tests for `computeEffectiveSourceWeight`:
   - missing type weight defaults to 1.0
   - null sourceWeight defaults to 1.0
   - clamping to `[0.1, 3.0]` (both low + high clamps)
3. Add unit tests for `rankCandidates`:
   - triage present uses `aha_score / 100` and includes triage fields in `triageJson`
   - triage absent uses `heuristicScore` but still emits `triageJson.system_features` when features exist
   - signal corroboration `matched=true` increases score by `wSignal` (before source multiplier)
   - novelty `novelty01` increases score by `wNovelty` (before source multiplier)
   - source weight multiplies the post-boost score
4. Sorting determinism:
   - Assert order is by `score desc`, then `candidateAtMs desc`.
   - If there is still a potential full-tie ambiguity (same score + same time), add an explicit final tie-breaker (e.g. `candidateId asc`) and cover it with a test.

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network.
- [ ] Ranking math + weight parsing is covered and stable.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(pipeline): cover rank scoring + weights parsing`
- **Files expected**:
  - `packages/pipeline/src/stages/rank.ts` (optional small deterministic sort tweak)
  - `packages/pipeline/src/stages/rank.test.ts`

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
- docs/_session/tasks/task-022-rank-tests.md
- docs/pipeline.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
