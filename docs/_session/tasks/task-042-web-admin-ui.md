# Task 042 — `feat(web): admin UI (sources + budgets + run now)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the admin UI surfaces:

- “Run now” (window + mode) → shows job id
- Sources management (enable/disable, cadence, weights)
- Budgets status view (credits usage + degraded mode warning)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- `docs/api.md`

## Scope (allowed files)

- `packages/web/**`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Add admin route(s) under `/app/admin`:
   - `run now` form calling `POST /api/admin/run`
   - show loading states + success/error toast
2. Sources page:
   - list sources (new `GET /api/admin/sources`)
   - enable toggle (optimistic)
   - edit cadence and weight with validation and safe patch semantics
3. Budgets page:
   - show credits usage from `GET /api/admin/budgets`
   - show “degraded mode” banner when `paidCallsAllowed=false`
4. Accessibility + responsiveness:
   - keyboard friendly forms
   - mobile layouts

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Admin pages work against the local API.
- [ ] Optimistic updates behave correctly and show rollback on failure.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `feat(web): add admin UI for sources + budgets + run now`
- **Files expected**:
  - `packages/web/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
