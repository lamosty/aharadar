# ADR 0005: LLM provider abstraction + model aliasing (avoid hardcoding GPT-5)

- **Status**: Proposed
- **Date**: 2025-12-17

## Context

The product spec references “GPT-5 family” as a pragmatic default, but:
- OpenAI model names will change (GPT‑6, new variants, etc.)
- we may choose Claude/Gemini for some tasks (quality/cost/latency)
- we must keep pipeline behavior stable as providers change

## Decision

Make the LLM layer **provider-agnostic**:

- define a single LLM interface that accepts `(provider, model)` (strings)
- keep prompts and outputs **versioned** and validated by strict JSON schema
- choose models via a router that maps:
  - `TaskType` × `BudgetTier` → `(provider, model)`
- keep “defaults” (e.g., OpenAI for triage/summaries) in config/ADRs, not as hardcoded contracts

## Consequences

- We can upgrade models without code changes (config-only).
- We can swap providers per task if needed.
- Logs/DB store `(provider, model)` for auditability (`provider_calls` and output JSON include them).

## Alternatives considered

- Hardcode a single provider/model family: simplest now, but fragile and creates churn in docs and code.
- Build multi-provider support later: risks baking assumptions that are expensive to unwind.


