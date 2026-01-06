# Task 041 — `feat(api): add budgets/status endpoint for UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expose a budgets/status endpoint so the UI can:

- show monthly/daily credits usage
- show “degraded mode” (paidCallsAllowed=false)
- warn users when budgets are approaching exhaustion

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md` (update contract)
- `docs/budgets.md`
- `docs/adr/0007-budget-units-credits.md`
- Code:
  - `packages/pipeline/src/budgets/credits.ts` (CreditsStatus computation)
  - `packages/api/src/routes/admin.ts`

## Scope (allowed files)

- `docs/api.md`
- `packages/api/src/routes/admin.ts`
- (optional) `packages/api/src/lib/budgets.ts` (small helper)

If anything else seems required, **stop and ask**.

## Endpoint to implement

`GET /api/admin/budgets`

Response:

- `{ ok: true, budgets: { monthlyUsed, monthlyLimit, monthlyRemaining, dailyUsed, dailyLimit, dailyRemaining, paidCallsAllowed, warningLevel } }`

## Implementation steps (ordered)

1. Update `docs/api.md` documenting this endpoint.
2. Implement handler:
   - resolve singleton `userId`
   - compute credits status using the existing pipeline helper
   - return the status in a stable JSON shape
3. Ensure consistent error envelopes and `NOT_INITIALIZED` behavior.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] Endpoint returns correct shape and respects current env budget config.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
```

## Commit

- **Message**: `feat(api): add budgets status endpoint for UI`
- **Files expected**:
  - `docs/api.md`
  - `packages/api/src/routes/admin.ts`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
