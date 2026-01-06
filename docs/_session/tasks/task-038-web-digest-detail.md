# Task 038 — `feat(web): digest detail + why shown + feedback`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the digest detail view:

- ranked items list
- “why shown” breakdown (system features)
- feedback actions with optimistic updates

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- `docs/api.md`
- `docs/pipeline.md` (what “why shown” means)

## Scope (allowed files)

- `packages/web/**`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Create `/app/digests/:id` page:
   - show digest header (window, mode)
   - list ranked items with title/url/author/publishedAt/sourceType
   - show summary/triage if present
2. “Why shown” UX:
   - per-item expandable panel (or drawer) reading from `triageJson.system_features.*`
   - include at least:
     - `signal_corroboration_v1`
     - `novelty_v1`
     - `source_weight_v1`
   - render unknown future features gracefully (don’t crash)
3. Feedback buttons:
   - like/dislike/save/skip
   - optimistic update + rollback on failure
   - show toasts for success/failure
4. Loading UX:
   - skeleton for initial load
   - show stale/cached indicator if offline
5. Accessibility:
   - all controls keyboard accessible
   - proper ARIA for expandable/collapsible sections

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Digest detail renders and is responsive.
- [ ] “Why shown” panel displays `system_features` and doesn’t break on missing fields.
- [ ] Feedback is optimistic and correct.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `feat(web): digest detail with why-shown + optimistic feedback`
- **Files expected**:
  - `packages/web/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.


