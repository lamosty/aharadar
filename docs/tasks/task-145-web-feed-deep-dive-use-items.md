# Task 145 — `refactor(feed): power Deep Dive tab via /items (remove /deep-dive/queue special-case)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Fix two user-facing issues on the Feed page’s “Deep Dive” tab:

1. The score shows as **0** for many items (because the tab uses a separate queue endpoint + different score plumbing).
2. The sort dropdown (Best / Trending / AI Score / etc.) is effectively a no-op in Deep Dive.

Implement the recommended architecture:

- The Feed page uses **one** list endpoint: `GET /api/items`
- The Deep Dive tab becomes a normal `view=deep_dive` query (added in Task 144)
- Sorting and filtering behave identically to Inbox/All (because it’s the same endpoint)

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-144-items-deep-dive-view.md` (this task depends on it)
- Code:
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedFilterBar.tsx`
  - `packages/web/e2e/feed.spec.ts`

## Decisions (locked for this task)

1. **No Feed-specific deep-dive endpoint usage**:
   - The Feed page must not call `GET /api/deep-dive/queue` anymore.
2. **Deep Dive tab = /items view**:
   - Deep Dive tab uses `GET /api/items?view=deep_dive` (plus existing filters/sort/topic/page params).
3. **Sort behavior**:
   - All sort options in the dropdown must actually affect results in Deep Dive.
   - No “clamping” (e.g. treating trending/ai_score as best).
4. **Score display**:
   - Deep Dive should display the same score value as Inbox does for the same item (no placeholder zeros).
   - Do not invent new scoring; just consume `ahaScore/trendingScore` as returned by `/items`.

## Scope (allowed files)

- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts` (only if needed for types or query keys)
- `packages/web/src/components/Feed/FeedFilterBar.tsx` (only if needed for view-specific sort options)
- `packages/web/src/messages/en.json` (only if you rename view keys)
- `packages/web/e2e/feed.spec.ts`

If anything else seems required, stop and ask before changing.

## Implementation steps (ordered)

### 1) Switch Feed Deep Dive tab to use `/items`

In `packages/web/src/app/app/feed/page.tsx`:

- Remove:
  - `transformQueueItemToFeedItem`
  - `useDeepDiveQueue(...)` usage
  - The “merge data sources based on view” block that swaps in `topPicksData`
  - Any `topPicksRefetch` usage used only for list refresh
- Replace with:
  - A single `usePagedItems(...)` call that always powers the list for all views.
  - When the selected view is Deep Dive, pass `view: "deep_dive"` to `usePagedItems`.

### 2) Update view typing + URL param parsing

In `packages/web/src/lib/api.ts`:

- Update `FeedView` to include `"deep_dive"`.
- Decide what to do with `"top_picks"` (current URL param):
  - Either fully rename to `"deep_dive"` everywhere, or
  - Keep `"top_picks"` only as a backward-compat URL alias (parse it, but write `deep_dive` going forward).

If you add an alias, keep it small and explicit (no multi-version compatibility layer).

### 3) Ensure Deep Dive decisions refresh the list

In `packages/web/src/app/app/feed/page.tsx`:

- `handleDeepDiveDecision` should refetch the **items** query for the current view (Deep Dive).
- Ensure “Promote” / “Drop” causes the reviewed item to disappear from the Deep Dive list after refetch (because `/items?view=deep_dive` excludes promoted/dropped).

### 4) Make sort dropdown actually work in Deep Dive

In `packages/web/src/app/app/feed/page.tsx`:

- Remove any logic that maps Deep Dive sort options to “best” (clamping).
- Ensure `sort` state updates URL and is passed through to `/items` unchanged.

In `packages/web/src/components/Feed/FeedFilterBar.tsx`:

- If `ai_score` sort is intended for debug only, you may optionally hide it behind a feature flag later — but **do not** silently no-op it.
- For this task, keep it visible and functional.

### 5) Score rendering sanity check (no “0” placeholders)

Confirm that Feed items returned in Deep Dive view include `ahaScore` and/or `trendingScore`, and that `FeedItem` displays a non-zero score when it should.

If Deep Dive still shows 0 for real scored items after switching endpoints, stop and investigate (it would imply the API payload is missing `ahaScore` for this view).

### 6) E2E test: Deep Dive view requests `/api/items?view=deep_dive` and sort changes request

Update `packages/web/e2e/feed.spec.ts`:

- Extend network mocking to handle:
  - `/api/items` default (inbox/all) responses
  - `/api/items?view=deep_dive` responses
- Add a test that:
  - loads `/app/feed`
  - switches to Deep Dive tab
  - asserts items render
  - changes sort dropdown to “AI Score” (or “Trending”)
  - asserts the outgoing request URL includes `sort=ai_score` (or `sort=trending`)

Keep selectors stable (use existing `data-testid`s).

## Acceptance criteria

- [ ] Feed Deep Dive tab uses only `GET /api/items?view=deep_dive` for list data.
- [ ] Deep Dive items show real scores (no systemic “0” due to missing fields).
- [ ] Sort dropdown changes actually reorder the list in Deep Dive (requests include correct `sort`).
- [ ] Promote/Drop refreshes the list and removes reviewed items from the queue.
- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm test:e2e` (or the repo’s existing e2e command) passes for the updated spec.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test:e2e
pnpm dev:api
pnpm dev:web
# Manual smoke:
# 1) Go to /app/feed, open Deep Dive tab
# 2) Change sort Best → Trending → AI Score; confirm list changes
# 3) Paste+Generate summary for an item, then Drop; confirm it disappears after refresh
```

## Commit

- **Message**: `refactor(feed): use /items for Deep Dive tab`
- **Files expected**:
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/components/Feed/FeedFilterBar.tsx` (optional)
  - `packages/web/src/messages/en.json` (optional)
  - `packages/web/e2e/feed.spec.ts`

