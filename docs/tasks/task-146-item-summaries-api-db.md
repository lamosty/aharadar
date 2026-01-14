# Task 146 — `feat(item-summaries): replace deep-dive storage + endpoints`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Workflow notes (required)

- Use `git status` before/after to ensure only intended files are staged.
- If any behavior is unclear, spawn a subagent to inspect the relevant file(s) and summarize before proceeding.
- Run the test plan **before** committing.
- One commit only; do not amend or squash unless the driver explicitly requests it.

## Goal

Replace the **Deep Dive** manual summary workflow with a **manual item summary** workflow:

- remove deep-dive naming and promote/drop statuses
- store summaries in a new `content_item_summaries` table
- expose a new API endpoint for **generate + save**
- return summaries via `GET /items` for all views
- remove `/deep-dive/*` routes and `view=deep_dive`

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/data-model.md`
- `docs/llm.md`
- Code:
  - `packages/api/src/routes/deep-dive.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/main.ts`
  - `packages/db/migrations/0025_deep_reviews.sql`
  - `packages/db/migrations/0026_deep_reviews_preview.sql`
  - `packages/db/src/repos/deep_reviews.ts`
  - `packages/llm/src/manual_summary.ts`

## Decisions (locked)

1. **Remove Deep Dive naming** in backend (tables, endpoints, routes).
2. **Manual summaries are saved immediately** on generation; there is no promote/drop/preview status.
3. **Summaries are retained** regardless of feedback actions (like/dislike/skip).
4. **New endpoint path**: `POST /item-summaries`.
5. `/items` views are **only** `inbox | highlights | all` (remove `deep_dive`).

## Scope (allowed files)

- `packages/db/migrations/*`
- `packages/db/src/db.ts`
- `packages/db/src/index.ts`
- `packages/db/src/repos/*`
- `packages/api/src/main.ts`
- `packages/api/src/routes/*`
- `docs/spec.md`
- `docs/data-model.md`
- `docs/llm.md`

If anything else seems required, **stop and ask** before changing.

## Implementation steps (ordered)

### 1) DB migration: replace deep reviews table

Create `packages/db/migrations/0027_item_summaries.sql`:

- Create `content_item_summaries` with:
  - `id` uuid primary key default `gen_random_uuid()`
  - `user_id` uuid not null references `users(id)`
  - `content_item_id` uuid not null references `content_items(id)`
  - `summary_json` jsonb not null
  - `source` text not null default `'manual_paste'`
  - `created_at`, `updated_at` (timestamptz, default now)
- Add indexes:
  - unique `(user_id, content_item_id)`
  - `(user_id, created_at desc)`
- Migrate existing summaries from `content_item_deep_reviews`:

```sql
insert into content_item_summaries (user_id, content_item_id, summary_json, source, created_at, updated_at)
select user_id, content_item_id, summary_json, 'manual_paste', created_at, updated_at
from content_item_deep_reviews
where summary_json is not null
on conflict (user_id, content_item_id)
  do update set summary_json = excluded.summary_json, updated_at = excluded.updated_at;
```

- Drop `content_item_deep_reviews` (`DROP TABLE IF EXISTS`) after migration.
- Migration should be **idempotent** (safe to re-run).

### 2) DB repo: new item summaries repo

- Add `packages/db/src/repos/item_summaries.ts` with:
  - `upsertSummary({ userId, contentItemId, summaryJson, source })`
- Update `packages/db/src/db.ts` to expose `itemSummaries`.
- Update `packages/db/src/index.ts` exports.
- Remove `deep_reviews` repo usage/exports.

### 3) API: new item summaries endpoint, remove deep-dive routes

- Create `packages/api/src/routes/item-summaries.ts`:
  - `POST /item-summaries`
  - Body: `{ contentItemId, pastedText, metadata? }`
  - Validate UUID, non-empty text, max 60k chars.
  - Use `computeCreditsStatus` gating (same as old deep-dive preview).
  - Call `manualSummarize` with metadata.
  - Log provider_calls with purpose `manual_summary`.
  - Persist via `db.itemSummaries.upsertSummary({ source: "manual_paste" })`.
  - Return `{ ok: true, summary, inputTokens, outputTokens, costEstimateCredits }`.

- Remove `packages/api/src/routes/deep-dive.ts` and its registration in `packages/api/src/main.ts`.

- Update `packages/api/src/routes/items.ts`:
  - Remove `view=deep_dive` handling.
  - LEFT JOIN `content_item_summaries` and select `summary_json` as `manual_summary_json`.
  - Return a new field in the response: `manualSummaryJson`.
  - Remove any deep-review joins/filters.

### 4) Docs updates (contracts)

- `docs/data-model.md`: replace deep review table with `content_item_summaries`.
- `docs/llm.md`: rename “Manual summary task (Deep Dive)” to “Manual item summary”; update storage notes.
- `docs/spec.md`: remove Deep Dive as a separate stage; describe inline manual summary.

## Acceptance criteria

- `content_item_summaries` exists and contains migrated summaries.
- `/deep-dive/*` routes are removed.
- `POST /item-summaries` generates + saves a summary.
- `GET /items` includes `manualSummaryJson` when available.
- `/items` no longer accepts `view=deep_dive`.
- `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm migrate
pnpm -r typecheck
```

## Commit

- **Message**: `feat(item-summaries): replace deep-dive endpoints and storage`
- **Files expected**:
  - `packages/db/migrations/0027_item_summaries.sql`
  - `packages/db/src/repos/item_summaries.ts`
  - `packages/db/src/db.ts`
  - `packages/db/src/index.ts`
  - `packages/api/src/main.ts`
  - `packages/api/src/routes/item-summaries.ts`
  - `packages/api/src/routes/items.ts`
  - `docs/spec.md`
  - `docs/data-model.md`
  - `docs/llm.md`
