# Task 039 — `feat(web): item detail page`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement a content item detail page that is readable and useful:

- canonical fields (title/url/author/publishedAt)
- metadata inspection (bounded, readable)
- clear navigation back to the digest

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- `docs/api.md`

## Scope (allowed files)

- `packages/web/**`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Create `/app/items/:id` page:
   - fetch via `GET /api/items/:id`
   - display readable header + “open original” link
2. Metadata:
   - show a readable JSON viewer (collapsed by default)
   - avoid huge UI (cap depth/size; truncate safely)
3. UX:
   - show skeleton/error states
   - ensure mobile readability

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Item detail renders and is responsive.
- [ ] Metadata viewer does not blow up the layout on large objects (bounded).

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `feat(web): add item detail page`
- **Files expected**:
  - `packages/web/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.


