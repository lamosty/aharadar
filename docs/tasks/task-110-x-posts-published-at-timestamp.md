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

Choose ONE strategy for post timestamps:

### Option A (recommended): derive timestamp from X status ID (“snowflake decode”)

- If `externalId/statusId` is parseable as a numeric X ID, derive creation time deterministically.
- Treat as a “true timestamp” (not fabrication) and store it in `published_at`.
- Pros: no extra provider dependency; works even if provider only returns URLs.
- Cons: assumes X IDs remain snowflake-like (likely stable, but still an assumption).

### Option B: change provider output to include full ISO timestamps

- Update the Grok system prompt to return `date` as an ISO timestamp (e.g. `2026-01-08T05:23:00Z`) instead of `YYYY-MM-DD`.
- Update normalization to parse full timestamps.
- Pros: explicit source-provided timestamp.
- Cons: relies on model/tool behavior; may still degrade to day-level.

### Option C: keep `published_at = null` unless a full timestamp is available; display day bucket from metadata

- Use `fetched_at` for windowing/recency, and only show `day_bucket/post_date` in the UI as an approximate date.
- Pros: strictly follows “don’t fabricate”; windowing behaves predictably.
- Cons: you lose true publish time unless you also implement A or B.

## Implementation steps (ordered)

1. Remove the noon-UTC fabrication from `packages/connectors/src/x_posts/normalize.ts`.
2. Implement the chosen strategy:
   - **A**: add a small helper to decode timestamp from numeric status ID (use `BigInt`), return ISO string.
   - **B**: update `grok_x_search` prompt + parsing to accept ISO timestamps; update normalizer accordingly.
   - **C**: set `publishedAt = null` when only day bucket; ensure metadata keeps `day_bucket` and/or `post_date`.
3. Add/extend tests:
   - at minimum: parsing/decoding returns a valid ISO timestamp for a known X ID (if A)
   - ensure invalid IDs don’t crash (fallback to null)
4. Validate impact on digest windowing:
   - run multiple digests per day and confirm X posts are included where expected (based on chosen semantics).
5. If this changes any spec/contract wording, update `docs/connectors.md` accordingly (explicitly, no silent divergence).

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
