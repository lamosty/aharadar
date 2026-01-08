# Task 010 — `chore(build): exclude *.test.ts from package dist outputs`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Optional polish: ensure `*.test.ts` files are **not compiled into `dist/`** when running `pnpm -r build`, while still keeping tests typechecked and runnable via `pnpm test`.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (What’s next #4)
- Code/config:
  - `packages/pipeline/tsconfig.json` + `packages/pipeline/package.json`
  - `packages/connectors/tsconfig.json` + `packages/connectors/package.json`
  - existing tests:
    - `packages/pipeline/src/stages/ingest.test.ts`
    - `packages/connectors/src/x_posts/normalize.test.ts`

## Scope (allowed files)

- `packages/pipeline/package.json`
- `packages/pipeline/tsconfig.build.json` (new)
- `packages/connectors/package.json`
- `packages/connectors/tsconfig.build.json` (new)

If anything else seems necessary, **stop and ask**.

## Implementation steps (ordered)

1. Add `tsconfig.build.json` for packages that contain tests (currently: `pipeline`, `connectors`):
   - extend the existing `tsconfig.json`
   - exclude test globs:
     - `src/**/*.test.ts`
     - `src/**/*.spec.ts`
2. Update each package’s `build` script to use `tsconfig.build.json` instead of `tsconfig.json`.
3. Keep `typecheck` using the normal `tsconfig.json` so tests remain typechecked.

## Acceptance criteria

- [ ] `pnpm -r build` succeeds.
- [ ] `pnpm test` succeeds.
- [ ] `dist/` outputs for `pipeline` and `connectors` do not include `*.test.*` artifacts.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm test

# Optional spot-check:
ls -R packages/pipeline/dist | grep -E "\.test\." && exit 1 || true
ls -R packages/connectors/dist | grep -E "\.test\." && exit 1 || true
```

## Commit

- **Message**: `chore(build): exclude *.test.ts from package dist outputs`
- **Files expected**:
  - `packages/pipeline/package.json`
  - `packages/pipeline/tsconfig.build.json`
  - `packages/connectors/package.json`
  - `packages/connectors/tsconfig.build.json`

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
- docs/_session/tasks/task-010-exclude-tests-from-dist.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build
- pnpm test

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
