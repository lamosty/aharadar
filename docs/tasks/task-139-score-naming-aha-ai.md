# Task 139 — Rename scores for consistency (Aha vs AI)

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Make score naming **consistent and durable** across DB, API, pipeline, UI, and docs:

- **Aha Score** = *final personalized ranking score* (the value used to order digests).
- **AI Score** = *raw LLM triage score* (model-only, no personalization).
- **Trending Score** = *decayed Aha Score* used **only** for `sort=trending`.

The UI currently mislabels the feed score as “Aha/AI score.” This task fixes the naming
and ensures the database schema reflects the terminology long‑term.

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/pipeline.md`
- `docs/llm.md`
- `docs/data-model.md`
- `docs/web.md`
- Code:
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/llm/src/triage.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/digests.ts`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/WhyShown/WhyShown.tsx`
  - `packages/web/src/messages/en.json`
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`

## Decisions (approved)

1) **Rename in DB**: `digest_items.score` → `digest_items.aha_score` (hard rename).
2) **Rename in triage JSON**: `aha_score` → `ai_score` with backfill migration.
3) **Aha Score display** = **raw final score** (no decay).
4) **Trending Score display** = **decayed score**, shown only when `sort=trending`.
5) **No history** needed; rename directly and update all internal code (no compat shims).

## Scope (allowed files)

- DB + migrations:
  - `packages/db/migrations/00xx_rename_scores.sql` (new)
  - `packages/db/src/repos/digest_items.ts`
  - `packages/db/src/repos/digests.ts`
- LLM:
  - `packages/llm/src/triage.ts`
- Pipeline:
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.ts`
- API:
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/digests.ts`
- Web:
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/WhyShown/WhyShown.tsx`
  - `packages/web/src/components/DigestDetail/*`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/messages/en.json`
- CLI:
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`
- Docs:
  - `docs/spec.md`
  - `docs/pipeline.md`
  - `docs/llm.md`
  - `docs/data-model.md`
  - `docs/web.md`

If you need new UI work beyond labels/fields, **stop and ask**.

## Implementation requirements

### 1) DB migration (required)

Create a migration to **rename** the final score column and backfill JSON:

- Rename column:
  - `digest_items.score` → `digest_items.aha_score`
- Rename index:
  - `digest_items_digest_score_idx` → `digest_items_digest_aha_score_idx`
- Backfill triage JSON keys:
  - `digest_items.triage_json`: move `aha_score` → `ai_score`
  - `abtest_results.triage_json`: move `aha_score` → `ai_score` (keep schemas consistent)

**Backfill rule:** only copy when `ai_score` is missing.
Example SQL (conceptual):

```sql
update digest_items
set triage_json = jsonb_set(triage_json, '{ai_score}', triage_json->'aha_score', true) - 'aha_score'
where triage_json ? 'aha_score' and not (triage_json ? 'ai_score');
```

### 2) LLM schema (required)

Update `packages/llm/src/triage.ts`:

- JSON schema field `aha_score` → `ai_score`
- Prompt text and parsing logic must expect `ai_score`

### 3) Pipeline ranking (required)

Update `packages/pipeline/src/stages/rank.ts`:

- Use `triage.ai_score` instead of `triage.aha_score`
- Keep scoring math unchanged
- Ensure `triageJson` written to digest items includes `ai_score`

### 4) Digest persistence (required)

Update `packages/pipeline/src/stages/digest.ts`:

- Write to `digest_items.aha_score` instead of `score`
- Any SQL uses of `score` must change to `aha_score`

### 5) API contracts (required)

Update API responses to expose **explicit names**:

- `GET /items`:
  - return `ahaScore` (raw final score)
  - return `trendingScore` (decayed score) when sort=trending
  - `aiScore` should be available via `triageJson.ai_score`
- `GET /digests` and `GET /digests/:id`:
  - `topScore` → `topAhaScore`
  - `score` → `ahaScore` in digest items

Update any sort or filter logic that references `aha_score`:

- `sort=ai_score` should use `triage_json->>'ai_score'`
- any references to `triage_json->>'aha_score'` must be updated

### 6) Web UI labels + data flow (required)

- **Feed** score badge should show **Aha Score** (raw) by default.
- When `sort=trending`, show **Trending Score** instead of Aha Score.
  - Tooltip: “Trending Score = Aha Score × recency decay.”
- WhyShown panel should label triage score as **AI Score**.
- Digest detail views should show **Aha Score** (not “Relevance”).

Update `packages/web/src/lib/api.ts` types to reflect renamed fields.

### 7) CLI output (required)

- `inbox` and `review` output:
  - display **aha** as final score
  - display **ai** as triage score (if shown)

### 8) Docs updates (required)

Update docs so definitions are explicit and consistent:

- `docs/spec.md`: Aha vs AI Score definition
- `docs/pipeline.md`: triage output uses `ai_score`, rank outputs `aha_score`
- `docs/llm.md`: triage schema uses `ai_score`
- `docs/data-model.md`: `digest_items.aha_score` column
- `docs/web.md`: UI labels for Aha/AI/Trending

## Acceptance criteria

- [ ] DB column renamed to `digest_items.aha_score`
- [ ] Existing triage JSON backfilled (`ai_score` present, `aha_score` removed)
- [ ] All API payloads use `ahaScore` for final score and `aiScore` for triage
- [ ] Feed score badge label matches definition (Aha or Trending)
- [ ] Why‑Shown labels triage score as AI Score
- [ ] CLI output uses consistent labels
- [ ] No lingering `aha_score` references outside triage JSON

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit (suggested)

- **Message**: `refactor(scores): rename aha vs ai scores for consistency`
- **Files expected**:
  - `packages/db/migrations/00xx_rename_scores.sql`
  - `packages/db/src/repos/digest_items.ts`
  - `packages/db/src/repos/digests.ts`
  - `packages/llm/src/triage.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/digests.ts`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/WhyShown/WhyShown.tsx`
  - `packages/web/src/components/DigestDetail/*`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/messages/en.json`
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`
  - `docs/spec.md`
  - `docs/pipeline.md`
  - `docs/llm.md`
  - `docs/data-model.md`
  - `docs/web.md`
