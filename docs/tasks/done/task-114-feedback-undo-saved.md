# Task 114: Feedback undo + meaningful Skip/Save + Saved view

## Priority: High

## Goal

Make feedback actions behave like a real review queue:

- **Skip** dismisses the item (no preference impact).
- **Save** acts as a bookmark and is visible in a Saved view.
- **Undo** clears feedback when you toggle an active action.

## Problems

1. UI toggles feedback off, but **undo is not persisted** (no API call).
2. **Skip** and **Save** do not change what the user sees (items stay in the feed).
3. No UI surface exists to view **Saved** items.

## Requirements

### 1) API: Clear feedback support

Add an explicit way to clear feedback for an item.

**Preferred API shape:**

```
DELETE /api/feedback
Body: { contentItemId: string, digestId?: string }
```

Behavior:

- Delete all feedback_events for (user_id, content_item_id)
- Return `{ ok: true }`
- If `digestId` is provided, validate UUID but do not require it

**Preference profile correctness**

After clearing feedback, recompute the topic preference profile to stay consistent:

- For the topic containing this content item, rebuild `topic_preference_profiles`
  from remaining feedback events (like/save/dislike).
- If no remaining feedback with embeddings, reset vectors + counts.

Notes:

- This is allowed to be heavier (single-user MVP).
- Skip and clear should **not** affect preference profiles.

### 2) API: Feed view filter

Add a query param to `GET /items`:

```
view=inbox | saved | all
```

Semantics:

- `inbox`: only items with **no feedback** (latest action is null)
- `saved`: only items with latest feedback = `save`
- `all`: no filtering

Make this filter work with existing pagination and sort.

### 3) Web: Feed view toggle

Add a small view toggle near the layout controls:

- **Inbox** (default)
- **Saved**
- **All**

Persist the selected view in the URL (`view=` param) and localStorage if needed.

### 4) Web: Feedback UI behavior

For Inbox view:

- After any feedback action (like/dislike/save/skip), **remove item** from the list.
- Undo (clear) should **reinsert** the item (on next fetch).

For Saved view:

- Show only saved items.
- Clicking Save again should **unsave** (clear feedback) and remove it.

For All view:

- Feedback actions update state but do not remove items.

### 5) Tooltips / copy

Update tooltip copy to reflect behavior:

- Skip = dismisses item without training preferences.
- Save = bookmark for later (and still trains preferences as it does today).

## Files to Modify

- `packages/api/src/routes/feedback.ts` (clear endpoint)
- `packages/db/src/repos/feedback_events.ts` (delete by item)
- `packages/db/src/repos/topic_preference_profiles.ts` (rebuild helper)
- `packages/api/src/routes/items.ts` (view filter)
- `packages/web/src/lib/api.ts` (new endpoints + params)
- `packages/web/src/lib/hooks.ts` (new mutations + view param support)
- `packages/web/src/app/app/feed/page.tsx` (view toggle + behavior)
- `packages/web/src/components/FeedbackButtons/FeedbackButtons.tsx` (undo action)
- `packages/web/src/messages/en.json` (tooltip copy)
- Optional: `packages/web/e2e/*` (update tests)

## Acceptance Criteria

- Undo clears feedback server-side and the item reverts to “no feedback.”
- Inbox hides items once any feedback is given.
- Saved view shows only saved items and supports unsave.
- All view shows everything, with feedback state visible.
- Skip does not affect preference profiles.
- Save continues to count as positive preference (existing behavior).

## Test Plan

```bash
pnpm dev:api
pnpm dev:web
```

1. Open feed in Inbox view, click Skip → item disappears.
2. Click Save → item disappears; switch to Saved view → item appears.
3. In Saved view, click Save again → item disappears.
4. Click Like, then click Like again → feedback clears.
5. Refresh feed → cleared items show no feedback state.
