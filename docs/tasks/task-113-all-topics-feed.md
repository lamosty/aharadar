# Task 113: Make "All topics" a real feed mode

## Priority: High

## Goal

When a user selects **All topics**, the feed should aggregate items across every topic they own, display the topic context per item, and keep URL/query state in sync.

## Problem

The UI exposes an **All topics** option and multiple pages deep-link to `/app/feed?topic=<id>`, but the feed ignores `topic` and the API defaults to the first topic. This creates incorrect/ambiguous behavior and broken deep links.

## Requirements

### 1) API (`GET /items`)

Add a topic scope that supports **all topics**:

- Accept `topicId=all` (string literal) in `GET /items`.
- Behavior:
  - If `topicId=all`, **do not filter** by `digests.topic_id`.
  - If `topicId` is a UUID, validate ownership and filter as today.
  - If `topicId` is missing, keep current behavior (default topic).

Add topic context to the response:

```ts
topicId: string;
topicName: string;
```

Implementation notes:

- In the `latest_items` CTE, include `d.topic_id` and use it in the outer select.
- Join `topics` to get `topic_name` (ensure user ownership).
- When `topicId=all`, `topicId` must be set per row from `d.topic_id`.

### 2) Web feed URL + state sync

- Read the `topic` query param on `/app/feed`:
  - `topic=all` → select All topics in the TopicSwitcher
  - `topic=<uuid>` → set current topic id in the TopicProvider
  - missing → keep existing default (TopicProvider rules)
- When the user switches topics in the TopicSwitcher:
  - Update URL query `topic=...` without dropping other query params (sources, sort, page).

### 3) Topic badge on feed items (All topics mode)

When `topic=all` is active:

- Show a small **topic badge** on each feed item card/row (e.g., next to the source badge).
- Use `topicName` from the API response.
- In per-topic mode, hide this badge (avoid duplicate noise).

### 4) Persistence

- Ensure All topics selection persists across reloads:
  - Either store a sentinel (`"all"`) in localStorage or rely on the URL param.
  - If using localStorage, update `TopicProvider` to treat `"all"` as `null` for selection logic.

### 5) Mark as caught up

All topics mode currently has no obvious behavior for “Mark as caught up.”

Implement one of the following (pick **A**):

- **A (preferred)**: Hide/disable the button when `topic=all`, with a tooltip: “Select a topic to mark as caught up.”
- **B**: Add an API endpoint to mark *all topics* as caught up and call it.

## Files to Modify

- `packages/api/src/routes/items.ts` (topic scope + topic fields)
- `packages/web/src/lib/api.ts` (FeedItem type update)
- `packages/web/src/app/app/feed/page.tsx` (topic query param sync)
- `packages/web/src/components/TopicProvider/TopicProvider.tsx` (optional persistence)
- `packages/web/src/components/TopicSwitcher/TopicSwitcher.tsx` (all topics wiring)
- `packages/web/src/components/Feed/FeedItem.tsx` (+ badge)
- `packages/web/src/components/Feed/FeedItem.module.css` (badge styles)
- `packages/web/src/messages/en.json` (new label/tooltip if needed)

## Acceptance Criteria

- `GET /items?topicId=all` returns items across all topics for the user.
- Feed shows correct topic badge only in All topics mode.
- `/app/feed?topic=<uuid>` correctly selects that topic in the UI.
- `/app/feed?topic=all` correctly selects All topics and shows aggregated feed.
- URL query params remain stable when switching topics.
- Mark as caught up behavior matches the chosen option (A or B).

## Test Plan

```bash
pnpm dev:web
pnpm dev:api
```

- Navigate to `/app/feed?topic=all` and verify items from multiple topics show.
- Switch topics via TopicSwitcher and confirm URL updates.
- Deep-link to `/app/feed?topic=<uuid>` and verify selection.
- Confirm topic badge only appears in All topics mode.
