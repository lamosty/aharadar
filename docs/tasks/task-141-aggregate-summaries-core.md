# Task 141 — `feat(aggregate-summaries): core schema + LLM task`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Introduce **aggregate summaries** for multi‑item scopes (digest and inbox). This task
creates the DB schema, repo access, per‑topic config, and LLM task/prompt.

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/pipeline.md`
- `docs/llm.md`
- `docs/data-model.md`
- Code:
  - `packages/llm/src/triage.ts`
  - `packages/llm/src/deep_summary.ts`
  - `packages/llm/src/types.ts`
  - `packages/db/src/repos/topics.ts`
  - `packages/shared/src/types/personalization_tuning.ts`

## Decisions (approved)

1) **Table name**: `aggregate_summaries`
2) **Unique per scope** (no history). Overwrite on manual re‑run.
3) **Configurable per topic** (default off).
4) **Separate job** will run later (handled in Task 142).
5) **Auto summaries** only when topic config enabled; low tier is off by default.

## Scope (allowed files)

- DB + migrations:
  - `packages/db/migrations/00xx_aggregate_summaries.sql` (new)
  - `packages/db/src/repos/aggregate_summaries.ts` (new)
- Shared types:
  - `packages/shared/src/types/aggregate_summary.ts` (new)
  - `packages/shared/src/types/index.ts`
  - `packages/shared/src/index.ts`
- LLM:
  - `packages/llm/src/aggregate_summary.ts` (new)
  - `packages/llm/src/types.ts`
  - `packages/llm/src/index.ts`
- Topics config:
  - `packages/db/src/repos/topics.ts`
- Docs:
  - `docs/spec.md`
  - `docs/llm.md`
  - `docs/data-model.md`
  - `docs/pipeline.md`

## Implementation requirements

### 1) DB schema (required)

Create `aggregate_summaries` with these fields:

- `id` uuid pk
- `user_id` uuid
- `scope_type` text (`digest|inbox|range|custom`)
- `scope_hash` text (unique per user)
- `digest_id` uuid null (set for digest scope)
- `topic_id` uuid null (set for digest/inbox)
- `status` text (`pending|complete|error|skipped`)
- `summary_json` jsonb
- `prompt_id`, `schema_version`, `provider`, `model`
- `input_item_count`, `input_char_count`, `input_tokens`, `output_tokens`
- `cost_estimate_credits` numeric
- `meta_json` jsonb
- `error_message` text
- `created_at`, `updated_at`

Indexes:
- unique `(user_id, scope_hash)`
- index on `(digest_id)`
- index on `(topic_id, scope_type)`

### 2) Shared types + scope hashing (required)

Add `AggregateSummaryScope` types in shared package:

- `AggregateSummaryScopeType`: `"digest" | "inbox" | "range" | "custom"`
- `AggregateSummaryScope`: structured object with normalized fields
- Helper to compute **deterministic scope_hash** (stable JSON order + sha256)

### 3) Topic config (required)

Store per‑topic config in `topics.custom_settings.aggregate_summary_v1`:

```ts
{ schema_version: "aggregate_summary_v1", enabled: boolean }
```

Add helper `parseAggregateSummaryConfig` with defaults (`enabled=false`).

### 4) LLM task: aggregate summary (required)

Create new LLM task:
- File: `packages/llm/src/aggregate_summary.ts`
- Output schema: `aggregate_summary_v1`
- Task type added to `packages/llm/src/types.ts`: `aggregate_summary`

Suggested output schema fields:
- `one_liner`
- `overview`
- `sentiment` { label, confidence, rationale }
- `themes[]` { title, summary, item_ids[] }
- `notable_items[]` { item_id, why }
- `open_questions[]`
- `suggested_followups[]`

Prompt must be **topic‑agnostic**, mention clusters (if present), and refer to
item IDs instead of inventing details.

### 5) Docs updates (required)

- `docs/data-model.md`: add `aggregate_summaries` table
- `docs/llm.md`: add `aggregate_summary` task + schema
- `docs/pipeline.md`: mention aggregate summary stage after digest (async job)
- `docs/spec.md`: new capability description

## Acceptance criteria

- [ ] `aggregate_summaries` table exists with indexes
- [ ] Shared types + scope hash helper implemented
- [ ] Topic config parser with defaults implemented
- [ ] New LLM task `aggregate_summary` with schema + prompt
- [ ] Docs updated to reflect new task + table

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit (suggested)

- **Message**: `feat(aggregate): add aggregate summaries core schema + LLM task`
- **Files expected**:
  - `packages/db/migrations/00xx_aggregate_summaries.sql`
  - `packages/db/src/repos/aggregate_summaries.ts`
  - `packages/shared/src/types/aggregate_summary.ts`
  - `packages/shared/src/types/index.ts`
  - `packages/shared/src/index.ts`
  - `packages/llm/src/aggregate_summary.ts`
  - `packages/llm/src/types.ts`
  - `packages/llm/src/index.ts`
  - `packages/db/src/repos/topics.ts`
  - `docs/spec.md`
  - `docs/llm.md`
  - `docs/data-model.md`
  - `docs/pipeline.md`
