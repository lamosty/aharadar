# Task 045 — `feat(web): unified feed view`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Create a new primary view `/app/feed` that shows ALL ranked items in a single scrollable feed, with source filters and sorting. This replaces digest-by-digest navigation as the primary UX.

## Background

Users want to see "all the best ideas ranked together" rather than navigating digest-by-digest. The digest concept becomes background metadata, not the primary navigation.

## Prerequisites

- Task 044 (unified items API endpoint) must be complete

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- Existing digest list/detail components for reference

## Scope (allowed files)

- `packages/web/src/app/app/feed/**` (new)
- `packages/web/src/components/Feed/**` (new)
- `packages/web/src/lib/api.ts` (add items endpoint)
- `packages/web/src/lib/hooks.ts` (add useItems hook)
- Navigation updates to add Feed link

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. **Add API client**:
   - Add `fetchItems(params)` to `api.ts`
   - Add `useItems(params)` hook with TanStack Query

2. **Create Feed page** (`/app/feed/page.tsx`):
   - URL params for filters: `?sources=hn,reddit&minScore=30`
   - Infinite scroll or "Load more" pagination
   - Show loading skeleton while fetching

3. **Create FilterBar component**:
   - Source type toggles (HN, Reddit, Twitter, RSS, etc.)
   - Score threshold slider (optional)
   - Date range picker (optional, can be phase 2)
   - Sort dropdown (Score / Newest / Oldest)

4. **Create FeedItem component**:
   - Reuse/adapt existing DigestItem component
   - Show: rank, title, source, author, score, feedback buttons
   - Include "Why shown" expandable panel
   - Show which digest it came from (as metadata, not primary)

5. **Update navigation**:
   - Add "Feed" link to sidebar (make it prominent)
   - Consider making Feed the default `/app` landing page
   - Keep "Digests" link but make it secondary

6. **Responsive design**:
   - Works well on mobile (single column)
   - Desktop can show filters in sidebar

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Feed shows items from multiple digests in one list
- [ ] Source filters work (show only HN, only Reddit, etc.)
- [ ] Pagination/infinite scroll works
- [ ] Feedback buttons work (like, dislike, save, skip)
- [ ] Mobile responsive

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm build
pnpm dev:api &
pnpm dev:web

# Open http://localhost:3000/app/feed
# Test:
# - Items load
# - Filter by source type
# - Load more / scroll
# - Click feedback buttons
# - Check mobile view (resize window)
```

## Design notes

- Keep it simple initially - Twitter-like vertical scroll
- Each item is a card with clear visual hierarchy
- Score can be shown as percentage badge or bar
- Source type as colored tag (HN orange, Reddit blue, etc.)
- Date relative ("2 hours ago") not absolute
