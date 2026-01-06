# Task 037 — `feat(web): digests list (layout packs: condensed/reader/timeline)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the digests list UI with excellent UX:

- fast navigation
- responsive layout
- skeletons
- 3 layout packs (different templates): condensed / reader / timeline

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- `docs/api.md`

## Scope (allowed files)

- `packages/web/**`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Create `/app/digests` page:
   - list digests (default last 7 days, as API does)
   - show mode + window + createdAt
   - responsive: implement 3 distinct templates:
     - Condensed: table-ish dense list
     - Reader: cards/editorial list
     - Timeline: feed/timeline layout
2. Skeleton loading states:
   - initial load skeleton
   - empty state
   - error state (with retry)
3. Navigation:
   - click to digest detail `/app/digests/:id`
   - prefetch on hover where possible
4. Accessibility:
   - keyboard navigation
   - correct heading hierarchy
   - accessible table/card semantics

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Digests list renders with skeleton/empty/error states.
- [ ] Layout switch changes **template structure** (not just CSS) without breaking layout.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `feat(web): implement digests list with condensed/reader modes`
- **Files expected**:
  - `packages/web/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
