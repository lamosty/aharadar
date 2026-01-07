# Task 002 — `refactor(connectors): extract grok x_search provider for reuse`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Refactor the Grok “x_search” provider implementation into a reusable module **without changing runtime behavior**. This reduces duplication when we add the canonical `x_posts` connector.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- Code:
  - `packages/connectors/src/signal/provider.ts`
  - `packages/connectors/src/signal/fetch.ts`

## Scope (allowed files)

- `packages/connectors/src/signal/provider.ts`
- new shared module under `packages/connectors/src/` (suggested: `x_shared/grok_x_search.ts`)
- minimal import adjustments elsewhere **only if required** (prefer re-exporting to avoid churn)

If anything else seems necessary, **stop and ask**.

## Rules

- No behavior change:
  - same env var names and fallbacks
  - same request shape
  - same response parsing
  - same errors/snippets
- Keep the signal connector working as-is after refactor.

## Implementation steps (ordered)

1. Create the shared module exporting:
   - `GrokXSearchParams`
   - `GrokXSearchResult`
   - `grokXSearch(params)`
2. Update `packages/connectors/src/signal/provider.ts` to re-export from the shared module (preferred) so existing imports keep working.
3. Ensure `packages/connectors` builds and typechecks.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] Manual smoke (if env configured):
  - `pnpm dev:cli -- admin:run-now --source-type signal`
  - still performs provider calls and stores results as before

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:cli -- admin:run-now --source-type signal
```

## Commit

- **Message**: `refactor(connectors): extract grok x_search provider for reuse`
- **Files expected**:
  - `packages/connectors/src/signal/provider.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts` (or similar)

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
- docs/_session/tasks/task-002-grok-provider-refactor.md

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
