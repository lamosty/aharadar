# Task 108 — `feat(api): include body_text + metadata in digest detail items`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Make `GET /api/digests/:id` return enough item content to render `x_posts` and other short-form sources with high UX value, specifically:

- `bodyText` (from `content_items.body_text`)
- `metadata` (from `content_items.metadata_json`)
- (recommended) `externalId` (from `content_items.external_id`)

Also, ensure digest detail has a **real, actionable `contentItemId`** even for cluster-based digest items by returning the cluster representative’s id as the effective `contentItemId` (while still returning `clusterId` so the client knows it’s a cluster).

This unblocks digest detail UI from showing tweet text, display names, and richer “why shown” context without N+1 calls.

## Background (why needed)

`x_posts` normalizes with `title = null` by design, putting the tweet text in `body_text`.
Digest detail currently only gets `title/url/author/publishedAt/sourceType` from the digest endpoint, so X rows show “(No title)”.

See:

- `docs/learnings/x-posts-digest-broken-2026-01-09.md`
- `packages/api/src/routes/digests.ts`

## Read first (required)

- `AGENTS.md`
- `docs/api.md`
- `docs/data-model.md` (what’s stored in `content_items`)
- `packages/api/src/routes/digests.ts`
- `packages/api/src/routes/items.ts` (reference for item fields)
- `packages/web/src/lib/api.ts` (frontend type contracts)

## Scope (allowed files)

- `packages/api/src/routes/digests.ts`
- `packages/web/src/lib/api.ts` (type updates to match response)

If anything else seems required, **stop and ask**.

## Decisions

- **Additive API change only**: extend the `items[].item` object shape returned by `GET /api/digests/:id`.
- **No raw payload exposure**: do not return `raw_json`.
- **Cluster compatibility**: for cluster rows, return the cluster representative’s `body_text/metadata/external_id` (same COALESCE approach as today for title/url/etc).
- **Cluster actions**: for cluster rows, return `contentItemId = representative_content_item_id` (effective id for feedback/navigation) while still returning `clusterId`.

Already decided (driver):

- OK to expand `GET /api/digests/:id` items to include `bodyText`, `metadata`, and `externalId`.

## Implementation steps (ordered)

1. Update the digest items SQL in `packages/api/src/routes/digests.ts` to select:
   - `COALESCE(ci.body_text, ci_rep.body_text) as item_body_text`
   - `COALESCE(ci.metadata_json, ci_rep.metadata_json) as item_metadata_json`
   - `COALESCE(ci.external_id, ci_rep.external_id) as item_external_id`
   - `COALESCE(di.content_item_id, ci_rep.id)::text as effective_content_item_id` (or equivalent)
2. Extend `DigestItemRow` (route-local interface) to include these columns.
3. In the response mapping:
   - return `contentItemId: effective_content_item_id` (not `di.content_item_id`), while preserving `clusterId` as today
   - extend `item` to include:
   - `bodyText`
   - `metadata`
   - `externalId`
4. Update `packages/web/src/lib/api.ts` types for digest detail:
   - extend `ContentItemBrief` accordingly
   - ensure any downstream compile errors are addressed (web adapter likely needs updates in a follow-up task)
5. Manual smoke:
   - call `GET /api/digests/:id` and confirm X items include `bodyText` and `metadata.user_display_name` when present.
   - confirm cluster-based digest items have a real `contentItemId` (UUID) so feedback can work.

## Acceptance criteria

- [ ] `GET /api/digests/:id` returns `item.bodyText` and `item.metadata` for both direct items and cluster representatives.
- [ ] Cluster-based digest items return a non-null, real `contentItemId` (representative id) while preserving `clusterId`.
- [ ] `x_posts` digest items have non-empty `item.bodyText` in typical cases.
- [ ] `pnpm -r typecheck` and `pnpm -r build` pass.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Optional manual smoke (driver-run):
# curl -H "X-API-Key: ..." http://localhost:3001/api/digests/<id>
```

## Commit

- **Message**: `feat(api): include bodyText + metadata in digest detail items`
- **Files expected**:
  - `packages/api/src/routes/digests.ts`
  - `packages/web/src/lib/api.ts`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
