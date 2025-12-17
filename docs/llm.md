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

## Router contract

```ts
type TaskType = "triage" | "deep_summary" | "entity_extract" | "signal_parse";
type BudgetTier = "low" | "normal" | "high";

interface LLMRouter {
  chooseModel(task: TaskType, tier: BudgetTier): { provider: string; model: string };
  call(task: TaskType, ref: { provider: string; model: string }, input: unknown): Promise<unknown>;
}
```

**Routing policy (Proposed)**
- `triage`: fastest/cheapest model that is reliable at strict JSON
- `deep_summary`: more capable model
- `entity_extract`: cheap model unless dial-up
- `signal_parse`: cheap model

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


