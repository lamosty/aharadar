# Task 006 — `test: add minimal unit tests for cadence + x_posts parsing`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add the first minimal unit tests to the repo. We currently have **no tests**, so this task establishes the foundation and covers the riskiest new logic:

- cadence “due” computation
- `x_posts` URL parsing (status id / handle extraction)

Keep it lightweight and fast.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/workflows/ai-collab.md` (why we need tests early)
- `docs/adr/0009-source-cadence.md`

## Scope (allowed files)

Add a minimal test setup in one place (choose one):

- Option A: root-level `vitest` config + per-package tests (recommended)
- Option B: add tests only in one package first (e.g. `packages/pipeline`)

If you add a new dev dependency, document it in the commit message body.

## Implementation steps (ordered)

1. Choose a minimal runner (recommendation: Vitest).
2. Add a `pnpm test` (or `pnpm -r test`) script that runs quickly.
3. Write tests for:
   - `isSourceDue(cadence, lastFetchAt, now)` with edge cases
   - `parseXStatusId(url)` / `parseXHandle(url)` with representative URLs
4. Ensure tests run in CI-friendly mode (no interactive prompts).

## Acceptance criteria

- [ ] `pnpm test` (or `pnpm -r test`) runs and passes
- [ ] Tests cover at least:
  - cadence due: missing last_fetch_at, too-soon, due, invalid config
  - x_posts parsing: x.com and twitter.com variants
- [ ] `pnpm -r typecheck` passes

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test: add minimal unit tests for cadence + x_posts parsing`

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
- docs/_session/tasks/task-006-tests.md

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


