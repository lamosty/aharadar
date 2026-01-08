# Task 017 — `feat(cli): show ranking breakdown in review details`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Improve explainability in the CLI review loop by showing a compact ranking breakdown:

- heuristic score components (recency/engagement)
- preference similarity (already shown)
- novelty (Task 015)
- signal corroboration (Task 011)
- source weight (Task 016)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- Code:
  - `packages/cli/src/commands/review.ts` (details view; why shown)
  - `packages/cli/src/commands/inbox.ts` (optional reference)
  - `packages/pipeline/src/stages/digest.ts` (where we can attach `system_features` into triage_json)
  - `packages/pipeline/src/stages/rank.ts` (weights)

## Scope (allowed files)

- `packages/cli/src/commands/review.ts`
- (optional) `packages/cli/src/commands/inbox.ts`

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Explainability should be driven primarily by `triage_json.system_features.*` when present.
- If triage_json is missing (heuristic-only runs), review should still work; breakdown can show “(no triage/system_features)”.

## Implementation steps (ordered)

1. Extend `review.ts` details view to print a new section, e.g.:
   - `ranking_breakdown:`
   - `heuristic_score=...`
   - `novelty=...`
   - `signal_corroboration=matched|not_matched`
   - `source_weight=...`
2. Pull values from `triage_json.system_features`:
   - `novelty_v1`
   - `signal_corroboration_v1`
   - `source_weight_v1`
   - (if present) any stored heuristic components
3. Keep output stable + readable (short numbers, consistent labels).

## Acceptance criteria

- [ ] `review` details view prints a ranking breakdown when `triage_json.system_features` exists.
- [ ] `review` does not crash when triage_json is null or missing system_features.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:cli -- admin:run-now
pnpm dev:cli -- review
```

## Commit

- **Message**: `feat(cli): show ranking breakdown in review details`
- **Files expected**:
  - `packages/cli/src/commands/review.ts`
  - (optional) `packages/cli/src/commands/inbox.ts`

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
- docs/_session/tasks/task-017-why-shown-ranking-breakdown.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>
```
