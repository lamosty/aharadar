# Task 110 — `fix(x_posts): published_at + post timestamp strategy`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Fix `x_posts.published_at` handling so we:

- **do not fabricate timestamps** from day buckets
- can (optionally) store **accurate post timestamps** when available
- avoid distorting digest window inclusion and recency scoring

This should also align implementation with the existing spec/task guidance.

## Background (current mismatch)

The repo’s earlier guidance explicitly said: **don’t fabricate timestamps; if only a day bucket, keep `publishedAt = null`**:

- `docs/tasks/done/task-005-x-posts-normalize.md`
- `docs/connectors.md` (`x_posts` normalize section)

But the current implementation sets:

- `publishedAt = "${YYYY-MM-DD}T12:00:00Z"` (noon UTC) when only a day bucket is present

See:

- `packages/connectors/src/x_posts/normalize.ts`

This can cause X posts to “stick” to the digest window that contains noon when multiple digests run per day.

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md` (x_posts + published_at rules)
- `docs/pipeline.md` (candidate selection uses `coalesce(published_at, fetched_at)` in windows)
- `docs/tasks/done/task-005-x-posts-normalize.md`
- Code:
  - `packages/connectors/src/x_posts/normalize.ts`
  - `packages/connectors/src/x_posts/fetch.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - existing tests around X URL parsing (if any)

## Scope (allowed files)

- `packages/connectors/src/x_posts/**`
- (optional) `packages/connectors/src/x_shared/grok_x_search.ts` (if prompt/output changes are chosen)
- (optional) `packages/pipeline/**` (only if needed for windowing correctness)
- (optional) docs alignment: `docs/connectors.md` (only if contract changes)

If anything else seems required, **stop and ask**.

## Decisions (driver required)

Already decided (driver):

- **Primary**: update the shared Grok x_search prompt to return a full ISO timestamp when possible (e.g. `2026-01-08T05:23:00Z`) rather than day-only.
- **Fallback (secondary)**: if Grok does not return a reliable timestamp, derive it from the X status ID (“snowflake decode”) when possible.
- **Fallback (final)**: if neither is available (or the derived timestamp is implausible), keep `published_at = null` and rely on `fetched_at`/digest timestamps for windowing + UI fallback.

Notes:

- We are currently **not using the `signal` concept**; do not add signal-related behavior here.

## Prompt design (critical — optimize for reliability + low tokens)

The current `grok_x_search.ts` prompt is optimized for “high-signal filtering” and day-level dates. For `x_posts`, we want **reliable canonical data** (id/url/text/timestamp) and we should let the downstream pipeline triage decide what’s “high signal”.

### Output schema (strict)

Return a JSON array of objects (no wrapper). Each object must be:

```json
{
  "id": "1234567890",
  "date": "2026-01-08T05:23:00Z",
  "url": "https://x.com/handle/status/1234567890",
  "text": "single line tweet text…",
  "user_handle": "handle",
  "user_display_name": "Display Name",
  "metrics": { "reply_count": 0, "repost_count": 0, "like_count": 0, "quote_count": 0, "view_count": 0 }
}
```

Rules:

- `date`: **prefer full ISO timestamp in UTC**. If only day-level is available, return `YYYY-MM-DD`. If unknown, `null`.
- `url`: must be a status URL (x.com or twitter.com). If tool doesn’t provide `url` but you have `id` + `user_handle`, construct: `https://x.com/<user_handle>/status/<id>`.
- `text`: must be **one line**, no newlines, **no paraphrasing**, and `<= maxTextChars`.
- `metrics`: **omit** the entire key if counts are unavailable (saves tokens). If present, counts must be numbers.

### Recommended new system prompt (drop “high-signal” filtering)

Replace the current system prompt with something like:

```text
Return STRICT JSON only (no markdown, no prose). Output MUST be a JSON array.
Use the x_search tool if available to fetch real posts. If you cannot access real posts, return [].
Do NOT fabricate. If a field is unavailable from the tool results, use null (or omit optional keys).

Each array item MUST be an object with ONLY these keys:
- id (string, digits)
- date (string|null): prefer ISO 8601 UTC timestamp (e.g. 2026-01-08T05:23:00Z). If only day-level is available, use YYYY-MM-DD.
- url (string|null): status URL (https://x.com/<handle>/status/<id> or twitter.com)
- text (string): single line, <= ${maxTextChars} chars, no newlines, no paraphrasing
- user_handle (string|null): without "@"
- user_display_name (string|null): display name shown on profile
- metrics (optional object): include ONLY if the tool provides counts; keys reply_count, repost_count, like_count, quote_count, view_count

Return at most the requested limit results, newest first. Exclude only empty/invalid items (missing text or missing both url and (id+user_handle)).
```

### User prompt (keep short)

Keep the user prompt simple (the tool + query parameters do the work). Avoid adding “high-signal” constraints here; downstream triage handles it.

## Implementation steps (ordered)

1. Remove the noon-UTC fabrication from `packages/connectors/src/x_posts/normalize.ts`.
2. Update `packages/connectors/src/x_shared/grok_x_search.ts` system prompt to the new schema above (optimize for reliability + low tokens):
   - Prefer full ISO timestamps in `date`
   - Include `id` and `user_handle` (enables URL construction + snowflake fallback)
   - Omit `metrics` unless present (token saver)
   - Remove “high-signal only” pre-filtering (leave that to triage)
3. Update `packages/connectors/src/x_posts/fetch.ts` to persist the additional raw fields (`id`, `user_handle`, optional `metrics`) into the raw item (so normalize can use them).
4. Update `packages/connectors/src/x_posts/normalize.ts`:
   - If `date` is a full ISO timestamp, set `publishedAt` to that exact timestamp.
   - Else attempt snowflake decode from the numeric status id (from `id` or parsed from URL):
     - accept only if it yields a plausible time (not in the far past/future)
   - Else keep `publishedAt = null` (do not fabricate).
   - Keep `metadata.post_date` (day, when available) and `metadata.day_bucket` for UI/analytics.
5. Add/extend tests:
   - accepts ISO timestamps and stores them exactly
   - accepts day-only and leaves `publishedAt = null`
   - snowflake decode returns a plausible timestamp for a known id (and rejects implausible)
   - invalid/empty fields do not crash (safe null behavior)
6. Validate impact on digest windowing:
   - run multiple digests per day and confirm X posts are included predictably (no noon-window “stickiness”).
7. If this changes any spec/contract wording, update `docs/connectors.md` accordingly (explicitly, no silent divergence).

## Acceptance criteria

- [ ] `x_posts` no longer writes fabricated noon-UTC timestamps from `YYYY-MM-DD` day buckets.
- [ ] Chosen timestamp strategy is implemented and documented.
- [ ] Digest window inclusion/recency behaves predictably (no noon-window “stickiness” unless explicitly desired).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# Optional (driver-run) local smoke:
# pnpm dev:cli -- admin:run-now --source-type x_posts
# pnpm dev:cli -- admin:digest-now --max-items 20
```

## Commit

- **Message**: `fix(x_posts): correct published_at handling`
- **Files expected**:
  - `packages/connectors/src/x_posts/**`
  - (optional) `packages/connectors/src/x_shared/grok_x_search.ts`
  - (optional) `docs/connectors.md`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
