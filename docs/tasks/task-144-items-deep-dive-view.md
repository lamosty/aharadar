# Task 144 — `feat(items): add deep_dive view to /items (replace deep-dive queue for Feed)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Make the Feed’s “Deep Dive” tab use the **existing unified feed endpoint** (`GET /api/items`) instead of the bespoke `GET /api/deep-dive/queue`.

This task adds a new `view=deep_dive` to `GET /api/items` that returns the **Deep Dive review queue**:

- items with latest feedback = **like**
- excluding items already **promoted** or **dropped**
- including any existing **preview summary JSON** (so the UI can show “AI” ready + open the reader modal)

Also fix a current inconsistency: the web client exposes `sort=ai_score`, but `GET /api/items` rejects it. This task makes `ai_score` a valid sort for `/items`.

## Read first (required)

- `AGENTS.md`
- `docs/data-model.md` (especially `feedback_events`, `digest_items`, `content_item_deep_reviews`)
- `docs/llm.md` (manual summary output shape)
- Code:
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/deep-dive.ts` (existing semantics for queue vs promoted)
  - `packages/db/src/repos/deep_reviews.ts` (current queue semantics; used as reference only)

## Decisions (locked for this task)

1. **New `/items` view value**: add `view=deep_dive` (do not repurpose `highlights`).
2. **Deep Dive queue semantics** (must match existing `/deep-dive/queue` behavior):
   - latest feedback is `like`
   - deep review status is **absent** or `preview`
   - deep review status `promoted|dropped` must be excluded
3. **Preview summary exposure**:
   - only return a preview summary when deep review `status='preview'`
   - do **not** return promoted summaries via `/items`
4. **Sorting support**:
   - `/items` must accept `sort=ai_score` (in addition to best/latest/trending)
   - `ai_score` sorting uses `triage_json->>'ai_score'` (numeric), `NULLS LAST`

> If you believe `view=deep_dive` should be named differently (e.g. `deep_dive_queue`), stop and ask before implementing.

## Scope (allowed files)

- `packages/api/src/routes/items.ts`
- `docs/spec.md` (small contract note only, if needed)
- `docs/web.md` (small API param note only, if needed)

If anything else seems required, stop and ask before changing.

## Implementation steps (ordered)

### 1) Extend the `view` query param contract for `/api/items`

In `packages/api/src/routes/items.ts`:

- Update `ItemsListQuerystring["view"]` union to include `"deep_dive"`.
- Update any comments so the view list is explicit and up to date.

### 2) Make `sort=ai_score` a valid `/items` sort

In `packages/api/src/routes/items.ts`:

- Update the `validSorts` list to include `"ai_score"`.
- Ensure the `switch(sort)` case `"ai_score"` is reachable and uses:
  - `orderBy = "(li.triage_json->>'ai_score')::numeric DESC NULLS LAST"`

### 3) Add deep review join + filter semantics to the SQL (items + count)

#### 3a) Items query

Update the SQL in `itemsQuery` to:

- `LEFT JOIN content_item_deep_reviews dr`
  - join keys: `dr.user_id = <ctx.userId>` and `dr.content_item_id = li.content_item_id`
- Select a new column:
  - `CASE WHEN dr.status = 'preview' THEN dr.summary_json ELSE NULL END AS preview_summary_json`

Then update the **view filter logic**:

- Keep existing behavior:
  - `view=inbox` → `fe.action IS NULL`
  - `view=highlights` → `fe.action = 'like'`
  - `view=all` → no feedback filter
- Add new behavior:
  - `view=deep_dive` adds **both**:
    - `fe.action = 'like'`
    - `(dr.status IS NULL OR dr.status = 'preview')`

Important:

- `dr` must be available in the query when the filter references it.
- Ensure the join/filter does **not** change results for other views beyond the additional selected field.

#### 3b) Count query

Update `countQuery` to match the same filters for `view=deep_dive`:

- Add the same `LEFT JOIN content_item_deep_reviews dr ...` so the `dr.status` filter is valid.
- Keep the count consistent with the items query.

### 4) Return `previewSummaryJson` in the response items (only for preview)

In the row mapping return object for each item, add:

- `previewSummaryJson: row.preview_summary_json ?? undefined`

Do not include any other deep-review fields in the public response unless explicitly needed by the web task.

### 5) Deterministic ordering for pagination (required)

For any ORDER BY mode where ties are plausible (especially `ai_score` and `latest`), ensure ordering is deterministic so `LIMIT/OFFSET` pagination is stable.

Acceptable tie-breakers (choose one, keep it consistent across modes):

- `..., li.content_item_id DESC` (or ASC)
- or `..., li.digest_created_at DESC, li.content_item_id DESC`

Do not use non-deterministic ordering.

### 6) Minimal docs update (only if needed)

If docs currently claim `/items` only supports `inbox|highlights|all` or omit `ai_score`, add a brief note:

- `docs/spec.md`: mention the Feed “Deep Dive” view is backed by `GET /items?view=deep_dive`
- `docs/web.md`: mention the new `view` value + `ai_score` sort is supported

Keep docs changes small and factual (no large rewrite in this task).

## Acceptance criteria

- [ ] `GET /api/items` accepts `view=deep_dive`.
- [ ] `view=deep_dive` returns only liked items whose deep review status is `NULL` or `preview`.
- [ ] `view=deep_dive` excludes deep review status `promoted` and `dropped`.
- [ ] Items include `previewSummaryJson` **only** when status is `preview` (not promoted).
- [ ] `GET /api/items` accepts `sort=ai_score` and orders by triage `ai_score` (numeric).
- [ ] Pagination ordering is deterministic for all sort modes.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:api
# Manual smoke:
# 1) Like an item in the feed
# 2) Promote or Drop it via deep-dive decision endpoint (existing UI)
# 3) Call:
#    curl "http://localhost:3001/api/items?view=deep_dive&sort=best"
#    curl "http://localhost:3001/api/items?view=deep_dive&sort=ai_score"
# 4) Confirm promoted/dropped items are excluded, previewSummaryJson appears only for preview
```

## Commit

- **Message**: `feat(items): add deep_dive view and enable ai_score sort`
- **Files expected**:
  - `packages/api/src/routes/items.ts`
  - `docs/spec.md` (optional)
  - `docs/web.md` (optional)

