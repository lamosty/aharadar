# Task 043 — `test(web): add Playwright e2e (hermetic with API mocking)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add Playwright E2E tests that validate core UI flows without requiring a real DB/API (mock network in tests):

- landing page renders
- digests list + digest detail navigation
- “why shown” panel works
- feedback optimistic UX (mock success + mock failure)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`

## Scope (allowed files)

- `packages/web/**`
- (optional) root `package.json` scripts

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Add Playwright to `packages/web` and configure:
   - `pnpm --filter @aharadar/web... test:e2e` (or similar)
2. Ensure E2E tests are hermetic by intercepting network requests:
   - mock `/api/digests`, `/api/digests/:id`, `/api/feedback`, etc.
3. Write a small set of high-signal tests:
   - landing page smoke
   - digests list → digest detail
   - open “why shown” panel
   - feedback optimistic update (success + rollback on failure)
4. Keep them stable:
   - avoid brittle selectors; prefer `data-testid` on key elements.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] E2E tests run locally and do not require DB/API.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# run e2e (exact command depends on implementation)
pnpm --filter @aharadar/web... test:e2e
```

## Commit

- **Message**: `test(web): add Playwright e2e for core UI flows`
- **Files expected**:
  - `packages/web/**`
  - (optional) root `package.json` scripts

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
