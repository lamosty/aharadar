# Investigation Note — X posts “broken” in Digest Detail (2026-01-09)

## TL;DR (what’s broken)

In the **Digest Detail** page (the table view in your screenshot), X/Twitter posts (`source_type = x_posts`) look “broken” because:

1. **Title rendering assumes `title` exists**, but `x_posts` is intentionally normalized with `title = null` (short-form content). Digest detail does **not** fall back to `body_text`, so you get `(No title)` / `(Untitled)` rows.
2. **“Why shown” is effectively blank** because digest detail passes the wrong object into the `WhyShown` component: it passes `triageJson.system_features` instead of the full `triageJson`. The `WhyShown` component expects `system_features` to be nested under the features object, so it renders no sections.
3. **Triage “reason” isn’t shown** because digest detail uses `summaryJson.summary` as “triageSummary” (deep summary), not `triageJson.reason` (triage). When deep summaries are disabled (common), that section is empty.

Separately, there’s a pipeline/connector correctness issue:

4. `x_posts` currently **fabricates** `published_at` as `YYYY-MM-DDT12:00:00Z` from a day bucket, which violates the earlier task/spec guidance (“don’t fabricate timestamps”). This can also distort **digest window inclusion** if you run multiple digests per day (all X posts get pulled into the window that contains noon).

## Evidence (code pointers)

### 1) Digest detail “Why shown” is wired incorrectly

All three digest detail layouts pass `item.triageJson?.system_features` into `WhyShown`:

- `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`

But `WhyShown` expects the full triage object (`aha_score`, `reason`, and nested `system_features`), per:

- `packages/web/src/components/WhyShown/WhyShown.tsx`

Result: `hasFeatures === true` (because `system_features` has keys), but the component checks `features.system_features.*`, which is undefined, so it renders an empty panel.

### 2) Digest detail has no access to `body_text`

The digest detail API (`GET /api/digests/:id`) currently returns only:

- title/url/author/publishedAt/sourceType
- triageJson/summaryJson/entitiesJson

See:

- `packages/api/src/routes/digests.ts`

But X posts intentionally normalize with **`title = null`** and keep the tweet text in **`body_text`** (see below), so digest detail cannot render meaningful rows without either:

- adding `body_text` (or a derived “display title”) to the digest detail API response, or
- changing the digest detail web view to fetch richer item data (note: `/api/items/:id` also currently omits `body_text`).

### 2b) Cluster digest items can’t be acted on reliably (missing effective `contentItemId`)

Digest items can reference either:

- a `content_item_id` (single item candidate), or
- a `cluster_id` (cluster candidate, with a representative item)

In the DB model, those are mutually exclusive. The digest detail API currently returns `contentItemId: null` for cluster rows and does **not** return the representative content item id. The web digest detail adapter then fabricates an id like `item-3`, which can break:

- feedback actions (POST /feedback expects a real `contentItemId`)
- any navigation that relies on the real item id

This is separate from the X-posts display problem, but it contributes to digest detail feeling “broken” when clusters are present.

### 3) X posts normalize with `title = null` (by spec), but digest detail UI doesn’t fall back

Per connector contract, `x_posts` is short-form and uses `title = null`, `body_text = tweet text excerpt`:

- Spec: `docs/connectors.md` (“X/Twitter posts (`type = "x_posts"`) — canonical”)
- Implementation: `packages/connectors/src/x_posts/normalize.ts` (`title: null`, `bodyText: <tweet text>`)

The unified feed UI already does the right thing (fallback to `bodyText` when `title` is missing):

- `packages/web/src/components/Feed/FeedItem.tsx` → `getDisplayTitle()`

Digest detail templates do **not** do this:

- `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`

### 4) “Triage” text is wired to deep summaries, not triage reasons

Digest detail uses a “triageSummary” field, but the adapter currently sets it from `summaryJson.summary`:

- `packages/web/src/lib/mock-data.ts` → `adaptDigestItem()` uses `summaryJson`

This is not the triage reason. The triage reason lives in:

- `digest_items.triage_json.reason` (LLM triage output, schema `triage_v1`)

So when deep summaries are disabled (common), digest detail shows no useful triage text even if triage ran.

### 5) `x_posts.published_at` is currently fabricated from day buckets (can break windowing)

The `x_posts` normalizer currently does:

- `publishedAt = "${YYYY-MM-DD}T12:00:00Z"` (noon UTC)

See:

- `packages/connectors/src/x_posts/normalize.ts`

This conflicts with the earlier repo guidance for `x_posts` normalization:

- `docs/tasks/done/task-005-x-posts-normalize.md` explicitly says: **“Do not fabricate timestamps; if only a day bucket, keep `publishedAt = null`.”**
- `docs/connectors.md` also says: keep `published_at = null` if only day bucket is available.

Why this matters:

- Digest candidate selection and window inclusion use `coalesce(published_at, fetched_at)` (see `packages/pipeline/src/stages/digest.ts`).
- If you run **multiple digests per day**, “noon UTC” can cause all X posts for a day to get attributed to whichever window contains noon, and excluded from other windows.

## Recommended fixes (what to do next)

I recommend addressing the user-visible breakage first (digest detail UI + API payload), then resolving the published-at contract mismatch.

Proposed Opus tasks (see `docs/tasks/task-107`+ in this batch):

1. **Fix digest detail WhyShown wiring + triage reason display** (web-only)
2. **Return `body_text` + `metadata_json` in `GET /api/digests/:id` items** and return an effective `contentItemId` for cluster items (api + types)
3. **Update digest detail UI to display tweet text + display name for X** (web)
4. **Decide + implement correct `x_posts.published_at` strategy** (connectors/pipeline, docs alignment)

## Quick verification checklist (for debugging on a live DB)

1. **DB has tweet text**:
   - `content_items` rows where `source_type='x_posts'` should have non-null `body_text`.
2. **Digest items have triage**:
   - `digest_items.triage_json` should include `aha_score` + `reason` when triage ran.
3. **API returns triageJson**:
   - `GET /api/digests/:id` should include `triageJson` per item (it does today).
4. **Web digest detail currently drops it**:
   - digest detail passes `triageJson.system_features` into WhyShown, causing empty output.
