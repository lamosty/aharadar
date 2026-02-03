# Aha Radar — Budget Dial (MVP)

This document defines **what we budget**, **how we enforce budgets**, and how a **numeric credits budget pool** maps into tiered behavior (`low`, `normal`, `high`).

## Two-layer budget model (recommended)

### Layer 1 — Budget pool (user-facing)

The user sets a numeric budget cap in **credits**, e.g.:

- `monthly_credits` (primary)
- optional `daily_throttle_credits` to prevent burning the entire month in one day

This pool is what answers: “how much am I willing to spend?”

Top-ups (future billing):

- In MVP (single-user), “top up” can be manual (increase `monthly_credits`).
- Automated purchasing/billing is out-of-scope for MVP (see `docs/spec.md` non-goals).

### Credits exhaustion policy (recommended)

Users will often “top up”, but the system should still behave predictably when credits run out.

Config (Proposed):

```json
{
  "on_low_credits": "warn",
  "on_exhausted_credits": "fallback_low",
  "warning_thresholds": {
    "monthly_used_pct": [0.8, 0.95],
    "daily_throttle_used_pct": [0.8, 0.95]
  }
}
```

Behavior:

- **warn**: show warnings in CLI/API when approaching exhaustion.
- **fallback_low**: continue scheduled runs but force tier=`low` and disable paid provider calls that would exceed remaining credits (signals + LLM), while still attempting a triage-only/heuristic digest.
- **stop** (optional): stop scheduled runs entirely when exhausted (but still allow manual “run now” after top-up).

**Credits are an internal accounting unit.**

- Providers may bill us in some currency, but _users think in credits_.
- Later, we can sell/price credits in any currency; the core system just enforces a credits budget.

#### How credits are estimated (MVP contract)

To enforce a credits budget, we need a deterministic way to estimate “cost” from usage.

Proposed rule:

- every metered action produces a `cost_estimate_credits`
- we track a running total per user per budget period (monthly) and stop/skip when caps are reached

Proposed pricing config shape (example):

```json
{
  "credits_pricing": {
    "llm": {
      "openai:gpt-<model>": { "credits_per_1k_input_tokens": 5, "credits_per_1k_output_tokens": 15 },
      "anthropic:claude-<model>": { "credits_per_1k_input_tokens": 6, "credits_per_1k_output_tokens": 18 }
    },
    "embeddings": {
      "openai:text-embedding-<model>": { "credits_per_1k_tokens": 1 }
    },
    "signal": {
      "x_search:grok": { "credits_per_call": 50 }
    }
  }
}
```

Numbers are placeholders; the point is:

- credits are configurable
- budget enforcement uses credits regardless of billing currency

### Layer 2 — Budget tier (policy preset / derived)

We still use **tiers** (`low | normal | high`) to control _behavior_, such as:

- which features are enabled (deep summary/entities)
- which model tier to choose for each task
- how aggressively we triage/enrich

But the tier is **not the only budget control**:

- it can be chosen explicitly, **or**
- derived automatically from the remaining budget pool (e.g., drop to `low` when credits are low).

## What we budget (surfaces)

Budgets exist to keep spend predictable and to force graceful degradation.

### Ingestion (connector fetch)

- max items fetched per source per run
- max total items fetched per run (global cap)
- optional: max comment fetches (Reddit/HN)

### Embeddings

- max items embedded per run
- max embedding tokens (or chars) per item

### LLM tasks

Per purpose:

- triage calls
- deep summary calls
- entity extraction calls
- signal_parse calls (if any)

Per call:

- max input tokens
- max output tokens

### Signals (search/trend/alerts providers)

- max search calls per day
- max results per query
- query strictness / noise filters (tiered)

## Budget enforcement order (MVP)

When budgets are exceeded, degrade in this order:

1. **Skip entities**
2. **Skip deep summaries** (triage-only digest is still valid)
3. **Reduce triage coverage** (triage top K candidates; heuristic score others)
4. **Reduce embedding volume** (only embed newest/highest-priority items)
5. **Reduce ingestion volume** (lower per-source caps)

Hard constraint (from spec):

- Always attempt to output _some_ digest (`triage-only` is acceptable).

### Adaptive LLM scaling (implemented)

When credits are nearing limits, we proactively scale **LLM-heavy caps** to reduce spend while still producing a digest:

- **Approaching (>=80%)**: scale triage/deep-summary limits by **0.7**
- **Critical (>=95%)**: scale triage/deep-summary limits by **0.4**

This is applied to the computed digest plan (triage calls, deep summary calls, candidate pool size) before running the digest.

## Budget tier semantics (policy presets)

### low (previously “dial_down”)

- Prioritize: ingestion + basic clustering + minimal triage
- Deep summaries: **off**
- Entities: **off**

### normal

- Triage: broad coverage of candidates
- Deep summaries: on for top N
- Entities: optional for top N
- Signals (default): prefer higher signal-to-noise
  - exclude replies and retweets when compiling account-based X queries
  - keep per-query results modest (e.g. 5) unless explicitly increased

### high (previously “dial_up”)

- Higher caps on:
  - deep summaries
  - entities
  - signals
- Intended for “catch-up” or special research windows.
- Signals (high): allow spending more for recall
  - may include replies/retweets for account-based X queries (higher noise, higher spend)
  - may increase per-query results cap (e.g. back up to 20)

## Proposed config shape (per user)

Important: even with a credits pool, the system still enforces **hard caps** (calls/tokens/items). Those caps can be:

- **compiled** automatically from the pool + tier (recommended), and/or
- overridden explicitly (advanced).

```json
{
  "monthly_credits": 60000,
  "daily_throttle_credits": 2500,
  "tier": "normal",
  "ingest": {
    "max_items_per_source_per_run": 50,
    "max_total_items_per_run": 500,
    "max_comments_per_item": 0
  },
  "embed": {
    "max_items_per_run": 500
  },
  "llm": {
    "triage": { "max_calls_per_run": 200, "max_input_tokens": 900, "max_output_tokens": 250 },
    "deep_summary": { "max_calls_per_run": 20, "max_input_tokens": 1800, "max_output_tokens": 700 },
    "entity_extract": { "max_calls_per_run": 20, "max_input_tokens": 1200, "max_output_tokens": 350 }
  },
  "signal": {
    "max_search_calls_per_day": 10,
    "max_results_per_query": 5
  }
}
```

These numbers are placeholders; the important part is the **shape** and the enforcement order.

## Preset options (pick one to “Accept”)

These presets define a **policy tier**. You can still set _any_ numeric credits pool; the tier controls how the system spends that pool.

### Option A — Minimal cost

- `low` default
- Triage only top K candidates; deep summary disabled
- Best when you want **very low spend** and can tolerate missing some “aha” items

### Option B — Balanced MVP (recommended starting point)

- `normal` default
- Broad triage coverage, deep summary for top N
- Best for validating the core loop (signal → feedback → better signal)

### Option C — Research / catch-up

- `high` for catch-up windows
- Higher deep summary and entity extraction limits
- Intended for occasional use, not always-on
