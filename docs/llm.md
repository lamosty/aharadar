# Aha Radar — LLM Spec (provider-agnostic; MVP)

This document defines the LLM tasks, routing policy, and **strict JSON outputs** used by the pipeline.

## Goals (from `spec.md`)

- **Triage**: cheap, fast filtering/scoring with explicit **Aha Score (0–100)** (FR‑019a).
- **Deep summary**: only for top candidates (budget-aware).
- **Entities** (optional): structured extraction for search/filters.
- **X signal parse**: structure results from the configured X/Twitter search provider into normalized signal items.

## Topic-agnostic prompts (non-negotiable)

Prompts and outputs must be **domain-neutral**:

- no finance/crypto-specific assumptions
- categories/entities are extracted from the content itself and/or user profile, not from hardcoded domain taxonomies

## Provider-agnostic stance (MVP contract)

The **tasks** and **output schemas** are the contract; the exact model name is not.

We should be able to:

- upgrade OpenAI models (e.g., GPT‑5 → GPT‑6) without changing any contracts, and/or
- swap providers for specific tasks (Claude/Gemini/etc.) without changing downstream pipeline logic.

To enable that:

- routing chooses a `(provider, model)` pair from config, based on task + budget tier
- every output records `provider` and `model` for audit/debugging, but downstream stages depend on **schema**, not model identity.

### Implementation convention (recommended)

When a provider offers an OpenAI-compatible **Responses API**, prefer it over Chat Completions:

- we are not building a chat product; we want a single “request → structured output” contract
- tool calling tends to evolve faster in Responses endpoints than legacy chat endpoints
- treat Chat Completions as legacy/compat only (do not design new code around it)

## Router contract

```ts
type TaskType = "triage" | "deep_summary" | "manual_summary" | "entity_extract" | "signal_parse";
type BudgetTier = "low" | "normal" | "high";

interface LLMRouter {
  chooseModel(task: TaskType, tier: BudgetTier): { provider: string; model: string };
  call(task: TaskType, ref: { provider: string; model: string }, input: unknown): Promise<unknown>;
}
```

## Runtime configuration (env, MVP)

For now we use **OpenAI-compatible Responses API** settings (OpenAI only in config), while keeping the router abstraction in code for future multi‑provider support.

- Required:
  - `OPENAI_API_KEY`
  - `OPENAI_ENDPOINT` (full URL to `/v1/responses`) **or** `OPENAI_BASE_URL` (base URL; `/v1/responses` is appended)
- Recommended:
  - `OPENAI_MODEL` (fallback model name if task-specific is not set)
- Task-specific (triage):
  - `OPENAI_TRIAGE_MODEL` (or tiered overrides: `OPENAI_TRIAGE_MODEL_LOW`, `OPENAI_TRIAGE_MODEL_NORMAL`, `OPENAI_TRIAGE_MODEL_HIGH`)
  - `OPENAI_TRIAGE_MAX_OUTPUT_TOKENS` (default 250; set higher if you use reasoning effort)
  - `OPENAI_TRIAGE_MAX_INPUT_CHARS` (default 4000)
  - `OPENAI_TRIAGE_MAX_TITLE_CHARS` (default 240)
  - `OPENAI_TRIAGE_MAX_CALLS_PER_RUN` (optional cap on triage calls)
  - `OPENAI_TRIAGE_REASONING_EFFORT` (`none|low|medium|high`, optional; `none` disables reasoning; applies to all tiers for now)
- Embeddings (OpenAI-compatible):
  - Required (to enable embed stage + semantic search):
    - `OPENAI_API_KEY`
    - `OPENAI_EMBED_ENDPOINT` (full URL to `/v1/embeddings`) **or** `OPENAI_BASE_URL` (base URL; `/v1/embeddings` is appended)
      - If you only set `OPENAI_ENDPOINT` (Responses API), the implementation derives an embeddings endpoint from it when possible.
    - `OPENAI_EMBED_MODEL` (or tiered overrides: `OPENAI_EMBED_MODEL_LOW`, `OPENAI_EMBED_MODEL_NORMAL`, `OPENAI_EMBED_MODEL_HIGH`)
      - If unset, the implementation falls back to `OPENAI_MODEL`.
  - Limits (optional):
    - `OPENAI_EMBED_MAX_ITEMS_PER_RUN` (default 100)
    - `OPENAI_EMBED_BATCH_SIZE` (default 16)
    - `OPENAI_EMBED_MAX_INPUT_CHARS` (default 8000)
- Credits estimate (optional, best-effort):
  - `OPENAI_CREDITS_PER_1K_INPUT_TOKENS`
  - `OPENAI_CREDITS_PER_1K_OUTPUT_TOKENS`
  - Optional embedding overrides:
    - `OPENAI_EMBED_CREDITS_PER_1K_INPUT_TOKENS` (preferred)
    - `OPENAI_EMBED_CREDITS_PER_1K_TOKENS` (legacy alias)
  - Optional triage overrides:
    - `OPENAI_TRIAGE_CREDITS_PER_1K_INPUT_TOKENS`
    - `OPENAI_TRIAGE_CREDITS_PER_1K_OUTPUT_TOKENS`

**Routing policy (Proposed)**

- `triage`: fastest/cheapest model that is reliable at strict JSON
- `deep_summary`: more capable model
- `entity_extract`: cheap model unless dial-up
- `signal_parse`: cheap model

Note: we may later map reasoning effort by budget tier (low/normal/high). For now it is a single env toggle, and you should explicitly raise `OPENAI_TRIAGE_MAX_OUTPUT_TOKENS` when using reasoning.

## Output storage conventions

Store these outputs inside `digest_items`:

- `triage_json`: triage output (always when triage ran)
- `summary_json`: deep summary output (only for enriched items)
- `entities_json`: entities output (optional)

Each output JSON must include:

- `schema_version`
- `provider`
- `model`
- `prompt_id` (or prompt version string)

## Triage task

### Purpose

Return a strict JSON object including:

- `aha_score` (0–100)
- a short reason string
- minimal booleans to support filtering and dial decisions

### Output schema (triage_v1)

```json
{
  "schema_version": "triage_v1",
  "prompt_id": "triage_v1",
  "provider": "<provider-id>",
  "model": "<model-id>",
  "aha_score": 0,
  "reason": "Short explanation of why this is (or isn't) high-signal for the user.",
  "is_relevant": true,
  "is_novel": true,
  "categories": ["topic1", "topic2"],
  "should_deep_summarize": false
}
```

### Aha Score semantics (contract)

- **0–20**: noise / low-signal / redundant
- **21–50**: mildly interesting but not urgent
- **51–80**: clearly interesting and likely worth reading
- **81–100**: rare, high-signal, likely “aha”

### Input format (Proposed)

For a cluster candidate:

- representative title/body
- top N member titles and canonical URLs
- source provenance (reddit/hn/rss/youtube/signal)
- user preference profile summary (derived from likes/dislikes)
- budget tier (derived from numeric budget pool and policy)

## Deep summary task

### Purpose

Generate a deeper summary for top-ranked candidates, emphasizing:

- what happened
- why it matters
- caveats and open questions

### Output schema (deep_summary_v1)

```json
{
  "schema_version": "deep_summary_v1",
  "prompt_id": "deep_summary_v1",
  "provider": "<provider-id>",
  "model": "<model-id>",
  "one_liner": "One sentence.",
  "bullets": ["Bullet 1", "Bullet 2"],
  "why_it_matters": ["Reason 1", "Reason 2"],
  "risks_or_caveats": ["Caveat 1"],
  "suggested_followups": ["If relevant: what to read/check next"]
}
```

## Manual summary task (Deep Dive)

### Purpose

Generate a detailed summary from user-pasted full content for Deep Dive workflow.
Uses the same output schema as deep_summary, allowing users to create rich summaries
for content they've liked.

### Key differences from deep_summary

- **Input**: User-pasted text (up to 60,000 characters) instead of pre-fetched bodyText
- **Prompt note**: "If the content contains comments or discussion threads, surface the most insightful comments in the bullets section."
- **Budget gating**: Uses computeCreditsStatus (402 if exhausted)
- **Provider call purpose**: `manual_summary`

### Output schema (manual_summary_v1)

Same structure as deep_summary_v1:

```json
{
  "schema_version": "manual_summary_v1",
  "prompt_id": "manual_summary_v1",
  "provider": "<provider-id>",
  "model": "<model-id>",
  "one_liner": "One sentence.",
  "bullets": ["Bullet 1", "Bullet 2"],
  "why_it_matters": ["Reason 1", "Reason 2"],
  "risks_or_caveats": ["Caveat 1"],
  "suggested_followups": ["If relevant: what to read/check next"]
}
```

### Storage

Promoted summaries are stored in `content_item_deep_reviews.summary_json`.
Raw pasted text is never stored.

## Entity extraction (optional MVP)

### Output schema (entities_v1)

```json
{
  "schema_version": "entities_v1",
  "prompt_id": "entities_v1",
  "provider": "<provider-id>",
  "model": "<model-id>",
  "entities": [
    { "name": "OpenAI", "type": "org", "context": "Mentioned as..." },
    { "name": "AAPL", "type": "ticker", "context": "Discussed in..." }
  ]
}
```

Types (Proposed):

- `person | org | product | ticker | topic | place | paper`

## Reliability rules

- **Strict JSON only**: model must output exactly one JSON object.
- Validate outputs with a schema validator (Zod/JSON Schema).
- If validation fails:
  - retry once with a “fix JSON” instruction
  - fallback to a smaller/safer model if still failing
  - if still failing: mark call error and proceed without that output

## Retry/backoff policy (MVP)

- Retry once for:
  - transient errors (timeouts, 429/503)
  - JSON validation failure
- Exponential backoff with jitter.

## Accounting (FR‑022)

For every LLM call:

- create a `provider_calls` row with:
  - `purpose`, `provider`, `model`
  - tokens in/out
  - cost estimate in credits (best effort; exact pricing can be configured)
