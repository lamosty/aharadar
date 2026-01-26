# Task 151 — `feat(feed): on-demand catch-up packs (listwise, tiered)`

- **Owner**: GPT-5.2 xtra high (task author)
- **Implementer**: Claude Code Opus 4.5
- **Reviewer**: human

## Goal

Add an **on-demand Catch-up Pack** generator that transforms a large unread backlog
into a **time-boxed, tiered reading pack** (30–90 minutes) using **listwise LLM
selection**. The pack is **additive** (does not replace digests) and keeps ingest
+ triage at full volume. The user can still like/dislike items inside the pack to
train personalization.

This solves the "I missed a few days" problem without losing data or forcing
manual swiping through hundreds of items.

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/pipeline.md`
- `docs/llm.md`
- `docs/data-model.md`
- `docs/budgets.md`
- Code:
  - `packages/api/src/routes/items.ts` (current feed query + decay)
  - `packages/pipeline/src/stages/aggregate_summary.ts`
  - `packages/llm/src/aggregate_summary.ts`
  - `packages/llm/src/router.ts` (LLM provider selection)
  - `packages/api/src/routes/ask.ts` (LLM settings → runtime config)
  - `packages/web/src/app/app/feed/page.tsx` (current feed UX)

## Context (current reality)

From the local DB (2026-01-26):

- **Investing & Finances inbox**: 420 unread items in last 7 days.
- **Digest items last 7 days**: 1,050 total; 972 are Investing.
- **Source skew** (Investing inbox):
  - r/bitcoin 145
  - r/wallstreetbets 101
  - r/investing 89
  - X posts 85
- **AI score distribution (Investing, last 7d)**:
  - median ai_score ~30
  - only 22 unread items have ai_score >= 70; 7 have >= 80
- **Clustering is ineffective**: median cluster size is 1; only 10 clusters
  with >1 item in the last 7 days. Current `CLUSTER_SIM_THRESHOLD=0.86` is too
  high for short-text items.
- **Aggregate summaries** exist but have 0 complete rows; a prior attempt failed
  due to JSON parsing (model returned fenced JSON).

Implication: ranked inboxes alone do not reduce volume. We need a **time-budgeted
pack** that selects the best items **relative to the backlog** (listwise), not
just pointwise triage.

## Non-goals

- Do **not** change ingest, dedupe, or the existing digest pipeline.
- Do **not** reduce data collection. All items remain ingested and triaged.
- Do **not** add hard deletes. Packs are additive views.

## High-level solution

Introduce a **Catch-up Pack** flow:

1) **Candidate pool**: pull unread items from a timeframe (e.g., last 3/7/14 days)
   using existing digest_items + content_items.
2) **Prefilter**: select a manageable pool (e.g., 300–500) using existing
   aha_score, recency, and diversity heuristics (no LLM cost).
3) **Listwise batch selection**: chunk into 40–60 items, LLM picks top 8–12 per
   chunk, assigns a theme tag, and writes a short “why”.
4) **Final listwise pass**: LLM merges chunk winners into a **tiered pack**:
   - Must-read
   - Worth scanning
   - Headlines only
5) **Persist pack** in DB and display in UI.

This yields a **30–90 minute reading pack** while keeping full data retention.

## UX requirements

- **New button** in feed: “Generate catch-up pack”
- User selects **timeframe** (last 3/7/14 days) + **time budget** (30/45/60/90 min)
- Pack view shows tiers + themes + individual items
- Items in pack are still like/dislike/skip-able
- Explicit “Mark pack as read” action (optional; see open questions)

## Provider-agnostic LLM selection (must)

Use LLM settings from `llm_settings` (same pattern as Ask/Manual Summary):

- Build `LlmRuntimeConfig`
- Call `createConfiguredLlmRouter`
- Respect provider/model choices (e.g., Claude subscription vs OpenAI)

No hardcoded providers/models.

## Data model (proposed)

Create a new table for pack results (preferred):

`catchup_packs`:
- id uuid pk
- user_id uuid
- topic_id uuid
- scope_type text: `range` (initially)
- scope_hash text (unique per user)
- status text: `pending|complete|error|skipped`
- summary_json jsonb (schema: `catchup_pack_v1`)
- prompt_id, schema_version, provider, model
- input_item_count, input_char_count, input_tokens, output_tokens
- cost_estimate_credits
- meta_json (timing, selected filters, pool stats)
- error_message
- created_at, updated_at

Alternative: reuse `aggregate_summaries` with a new schema version. This is less
clean and mixes summary types.

## Catch-up pack schema (proposal)

```json
{
  "schema_version": "catchup_pack_v1",
  "prompt_id": "catchup_pack_v1",
  "provider": "<provider>",
  "model": "<model>",
  "time_budget_minutes": 60,
  "tiers": {
    "must_read": [{ "item_id": "...", "why": "...", "theme": "..." }],
    "worth_scanning": [{ "item_id": "...", "why": "...", "theme": "..." }],
    "headlines": [{ "item_id": "...", "why": "...", "theme": "..." }]
  },
  "themes": [
    { "title": "...", "summary": "...", "item_ids": ["..."] }
  ],
  "notes": "Optional overall guidance"
}
```

## Candidate pool selection (deterministic, no LLM)

- Inputs: topic_id, window_start, window_end, view=inbox
- Start with unread items only (default); allow optional include of liked items
- Compute pool using current aha_score + recency
- Enforce diversity by source_type + source_id + author (soft caps)
- Pool size targets:
  - 30 min pack → 150–250 pool
  - 60 min pack → 300–500 pool
  - 90 min pack → 400–700 pool

Include a **small exploration slice** (e.g., 10–15%) sampled from lower scores
so rare-but-interesting items can surface.

## Listwise batch selection

- Chunk size: 40–60 items
- Output per chunk: 8–12 items w/ `item_id`, `why`, `theme`
- JSON-only strict output (no code fences)
- Retry-on-JSON failure + fix JSON once (re-use existing reliability rules)

## Final listwise tiering

- Merge winners from all chunks
- Final LLM pass assigns **tier** + overall ordering
- Enforce max counts based on time budget

Approx pack size targets (adjustable):

| Budget | Must-read | Worth | Headlines | Total |
|--------|-----------|-------|-----------|-------|
| 30 min | 10         | 15    | 20        | 45    |
| 60 min | 15         | 25    | 40        | 80    |
| 90 min | 20         | 35    | 60        | 115   |

## Prompt inputs (token-smart)

Per item include:
- item_id
- title
- body_snippet (<= 200 chars)
- ai_score, aha_score
- source_type, author
- published_at (or age bucket)
- optional triage_reason

Keep item size small to control token usage.

## Feedback integration

- Packs are built from **current personalized ranking** (aha_score), which
  already reflects feedback.
- Optional: include a short “preference summary” in prompt:
  - top liked authors/sources
  - top disliked authors/sources
  - recent feedback ratio

Pack items **must** still allow like/dislike/skip events. This is how feedback
continues to improve ranking and future packs.

## UI behavior (proposed)

- Button: “Generate catch-up pack” in Feed
- Modal or panel for:
  - timeframe (3/7/14 days)
  - time budget (30/45/60/90)
  - optional toggle: “include liked items”
- Pack view:
  - Tier tabs or stacked sections
  - Theme chips + summary
  - Item cards (same as feed) with feedback controls
- Optional action: “Mark pack as read” (see open questions)

## Open questions (need decisions)

1) **Mark-as-read behavior**: Should “Mark pack as read” auto-submit `skip`
   feedback for all items in pack?
   - Option A: yes (clears inbox quickly; skip has no preference impact)
   - Option B: no (user manually handles)

2) **Inbox vs all items**: Should packs default to inbox-only, or include
   already-liked items if they are high-score?

3) **LLM input depth**: Title+snippet only, or include more body text?
   - More text improves selection but increases token cost.

4) **Theme granularity**: Do we need theme summaries, or just theme labels?

5) **Per-author caps**: Limit a single author (e.g., @KobeissiLetter) to max N
   in Must-read tier?

6) **Future integration**: Should packs leverage clustering if/when it improves?

## Known issues to resolve (blocking)

- `aggregate_summary` JSON parsing fails when model outputs fenced JSON. Add
  stricter prompt + fixer pass. Reuse this for catch-up pack tasks.

## Budget + token guardrails

- Use pool size caps + chunk size limits
- Use short snippets (<=200 chars)
- Avoid full text unless explicitly requested
- Persist input token counts in `provider_calls`

## Implementation checklist

### 1) Schema + repo
- [ ] Add `catchup_packs` table + indexes
- [ ] Repo methods: `upsert`, `getByScope`, `listByTopic`, `updateStatus`

### 2) LLM task
- [ ] Add `catchup_pack_v1` schema + prompt
- [ ] Strict JSON output, retry/fix policy
- [ ] Add to `TaskType` + router

### 3) API
- [ ] `POST /api/catchup-packs` (request: topic_id, timeframe, time_budget)
- [ ] `GET /api/catchup-packs/:id`
- [ ] Optional `GET /api/catchup-packs?topic_id=...`

### 4) Pack builder (pipeline-ish)
- [ ] Candidate pool query (digest_items + content_items)
- [ ] Diversity + exploration selection
- [ ] Batch listwise calls
- [ ] Final tiering call
- [ ] Persist results

### 5) UI
- [ ] Feed button + modal
- [ ] Pack view (tiered)
- [ ] Feedback actions on pack items
- [ ] Optional “Mark pack as read” action

## Acceptance criteria

- [ ] User can generate a pack for a timeframe + time budget
- [ ] Pack shows tiered items + themes
- [ ] Items are clickable and allow feedback
- [ ] Pack respects LLM provider settings
- [ ] Token usage is bounded by caps
- [ ] No changes to existing digest behavior

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Suggested commit message

`feat(feed): add on-demand catch-up packs with listwise ranking`
