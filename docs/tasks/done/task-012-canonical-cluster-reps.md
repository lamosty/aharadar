# Task 012 — `feat(pipeline): prefer canonical representatives for cluster digests`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Avoid “tweet-as-face” when a cluster contains richer canonical content:

- when selecting a representative item for a cluster (for triage input and for CLI display),
- prefer a representative that is more “canonical/readable” (MVP heuristic: **prefer items with a non-null title**),
- while keeping behavior topic-agnostic and deterministic.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (candidate selection + cluster behavior)
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (backlog item)
- Code:
  - `packages/pipeline/src/stages/digest.ts` (cluster candidate representative selection SQL)
  - `packages/cli/src/commands/inbox.ts` (how cluster items are displayed)
  - `packages/cli/src/commands/review.ts` (how cluster items are reviewed)

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/cli/src/commands/inbox.ts`
- `packages/cli/src/commands/review.ts`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Update representative selection in `packages/pipeline/src/stages/digest.ts` (cluster candidate SQL):
   - keep the existing “in-window, newest first” behavior
   - add a tie-break preference to choose a representative with `title is not null` when available within the window
2. Update representative selection in CLI queries (`inbox.ts`, `review.ts`) to match:
   - keep “prefer items within digest window”
   - within that, prefer `title is not null`
   - then fall back to recency
3. Keep behavior unchanged for clusters that have no titled items (e.g., all short-form): recency still wins.

## Acceptance criteria

- [ ] For a cluster with both titled items and untitled items within the window, the representative is titled.
- [ ] For clusters with only untitled items, representative selection behaves as before (recency-driven).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Smoke:
pnpm dev:cli -- admin:run-now
pnpm dev:cli -- inbox --cards
pnpm dev:cli -- review
```

## Commit

- **Message**: `feat(pipeline): prefer canonical representatives for cluster digests`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`

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
- docs/_session/tasks/task-012-canonical-cluster-reps.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
