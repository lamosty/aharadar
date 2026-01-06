# Task 024 — `test(pipeline): cover credits status + budget gating`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add hermetic unit tests that lock budget/credits behavior and ensure “credits exhausted” gating stays correct:

- credits status math + warning thresholds
- `paidCallsAllowed` propagation through `runPipelineOnce` (ingest/embed/digest)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/budgets.md`
- `docs/pipeline.md`
- `docs/adr/0007-budget-units-credits.md`
- Code:
  - `packages/pipeline/src/budgets/credits.ts`
  - `packages/pipeline/src/scheduler/run.ts`

## Scope (allowed files)

- `packages/pipeline/src/budgets/credits.ts`
- `packages/pipeline/src/budgets/credits.test.ts` (new)
- `packages/pipeline/src/scheduler/run.ts`
- `packages/pipeline/src/scheduler/run.test.ts` (new)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Credits accounting sums only `provider_calls.status = 'ok'`.
- UTC boundaries are used for month/day buckets (no user timezones yet).
- When credits are exhausted:
  - paid provider calls are disabled (`paidCallsAllowed=false`)
  - tier is forced to `low`
  - pipeline still attempts a heuristic digest (LLM triage skipped)

## Implementation steps (ordered)

1. Add unit tests for `computeCreditsStatus`:
   - monthly only: limit/used/remaining and `paidCallsAllowed`
   - daily throttle enabled: daily used/remaining and `paidCallsAllowed` when daily exhausted
   - warning levels:
     - `<80%` → `none`
     - `>=80%` → `approaching`
     - `>=95%` → `critical`
2. Add unit tests for `printCreditsWarning`:
   - capture `console.warn` and assert message shape
   - ensure it prints “Paid calls disabled” when `paidCallsAllowed=false`
3. Add unit tests for `runPipelineOnce` gating behavior:
   - use `vitest` module mocks for the stage functions (`ingestEnabledSources`, `embedTopicContentItems`, `persistDigestFromContentItems`, etc.)
   - when `computeCreditsStatus` returns `paidCallsAllowed=false`, assert:
     - ingest/embed/digest receive `paidCallsAllowed=false`
     - embed receives `tier: "low"`
     - digest receives `mode: "low"`
   - when `paidCallsAllowed=true` and no explicit `mode`, assert:
     - embed receives the current “effective tier” used by code today
     - digest receives `mode: "normal"` (default)

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network.
- [ ] Budget gating behavior is locked by tests.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(pipeline): cover credits status + budget gating`
- **Files expected**:
  - `packages/pipeline/src/budgets/credits.ts` (optional tiny testability tweaks only)
  - `packages/pipeline/src/budgets/credits.test.ts`
  - `packages/pipeline/src/scheduler/run.ts` (optional tiny testability tweaks only)
  - `packages/pipeline/src/scheduler/run.test.ts`

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
- docs/_session/tasks/task-024-budget-gating-tests.md
- docs/budgets.md
- docs/pipeline.md
- docs/adr/0007-budget-units-credits.md

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
