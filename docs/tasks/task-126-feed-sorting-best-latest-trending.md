# Task 126 — `feat(web,api): feed sort modes (Best default; Latest + Trending explicit)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Align the feed with the product goal (“best/most novel ideas”) by removing implicit recency dominance:

- Default feed sort becomes **Best** (no time decay)
- User can explicitly choose:
  - **Latest** (published_at desc)
  - **Trending** (time-decayed score)

This task is separate from digest scheduling, but is required to honor the contract from Task 120:

- recency must not dominate unless explicitly selected.

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- Code:
  - `packages/api/src/routes/items.ts` (currently uses decayed_score for score_desc)
  - `packages/web/src/components/Feed/FeedFilterBar.tsx`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`

## Scope (allowed files)

- `packages/api/src/routes/items.ts`
- `packages/web/src/components/Feed/FeedFilterBar.tsx`
- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/messages/en.json`

If you need pipeline changes, **stop and ask**.

## Decisions (already decided)

- Best ranking should not be recency-dominated.
- Recency-based ordering is allowed only when user explicitly selects it.
- Trending should be available as an explicit third option.

## Implementation requirements

### 1) API: new sort values (or repurpose existing)

Current API supports: `score_desc | date_desc | date_asc`.

Update it to support explicit semantics:

- `best` (default): order by **raw score** (no decay)
- `latest`: order by `published_at desc nulls last` (or fallback to digest_created_at)
- `trending`: order by `decayed_score desc` (existing decay math)

Implementation notes:

- You can keep backward compatibility temporarily by mapping old values:
  - `score_desc` -> `best`
  - `date_desc` -> `latest`
  - `date_asc` -> `oldest`
  …but per repo “no shims” preference, it’s acceptable to **change the web client simultaneously** and keep the API strict.

### 2) Web: update sort UI copy

Change the sort dropdown to:

- Best
- Latest
- Trending

Update labels in `en.json`.

### 3) Preserve existing decay settings for Trending only

Keep `decayHours` and the SQL decay math, but apply it only when sort=trending.

For sort=best:

- order by `li.score` (raw) or the computed non-decayed value.

### 4) URL/query param behavior

If the feed uses URL params for sort, ensure:

- defaults to `best` when missing
- URL stays in sync when the user changes sort

## Acceptance criteria

- [ ] Default feed sort is Best (no decay).
- [ ] Latest sorting is available and matches publication time.
- [ ] Trending sorting is explicit and is the only place decay applies.
- [ ] Web UI reflects new options and sends correct API params.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:api
pnpm dev:web
```

- Verify feed default is Best.
- Switch to Latest and confirm items reorder by date.
- Switch to Trending and confirm older high-score items can drop relative to newer ones.

## Commit

- **Message**: `feat(feed): make Best the default sort (no implicit decay)`
- **Files expected**:
  - `packages/api/src/routes/items.ts`
  - `packages/web/src/components/Feed/FeedFilterBar.tsx`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/messages/en.json`
