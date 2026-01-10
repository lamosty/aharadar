# Task 131 — `feat(web,api): highlights view / idea library for liked items`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a **Highlights / Idea Library** surface so high‑quality items don’t disappear after feedback. Users should be able to revisit “great ideas over time,” seeded by likes/saves and optionally high Aha scores.

## Read first (required)

- `AGENTS.md`
- `docs/pipeline.md`
- `docs/api.md`
- Code:
  - `packages/api/src/routes/items.ts`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`

## Scope (allowed files)

- `packages/api/src/routes/items.ts`
- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/components/Feed/*`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- (optional) `docs/api.md`

If anything else seems required, stop and ask before changing.

## Decisions (Driver Q&A)

- **Highlight rule**: feedback in `like` or `save` only.
- **Sorting**: use existing feed sort options (Best/Latest/Trending).
- **Topic scope**: respect the current topic selector; “All Topics” shows all highlights.

## Implementation steps (ordered)

1. **API support** (`GET /items`):
   - Add new `view=highlights` mode.
   - Implement filter: `feedback_action IN ('like','save')`.

2. **Feed UI**:
   - Add a “Highlights” tab alongside Inbox/Saved/All.
   - Update copy to explain this is a long‑term idea library.

3. **Sorting**:
   - Use existing sort modes (best/latest/trending); no special‑case.

4. **Docs** (optional):
   - Update API docs to include new view mode.

## Acceptance criteria

- [ ] Highlights tab visible in feed.
- [ ] Items in Highlights match the agreed rule.
- [ ] Items no longer “disappear” after feedback; likes/saves are surfaced.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:api
pnpm dev:web
# Like a few items → check Highlights view shows them.
```

## Commit

- **Message**: `feat(feed): add highlights view`
- **Files expected**:
  - `packages/api/src/routes/items.ts`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
