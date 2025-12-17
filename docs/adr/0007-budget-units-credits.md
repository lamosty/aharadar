# ADR 0007: Budget units — credits (not currency)

- **Status**: Accepted
- **Date**: 2025-12-17

## Context

We want budget controls that:
- are provider-agnostic and stable over time
- don’t assume the user thinks in USD
- support future billing/subscriptions without changing core pipeline logic

Providers may bill in currency, but the product experience should be “set a budget and it won’t exceed it”.

## Decision

Use **credits** as the internal and user-facing budget unit:

- users set `monthly_credits` (primary) with optional `daily_throttle_credits`
- the system accounts all spend in credits (`provider_calls.cost_estimate_credits` recorded in credits)
- currency conversion / pricing of credits is a **separate layer** (future billing)

## Consequences

- Core budgeting and enforcement is independent of currency.
- We can introduce multi-currency pricing later by selling credits in local currency.
- We still need a maintained mapping from provider usage (tokens/calls) → credits for estimation.

## Notes (MVP)

Single-user MVP can treat “credits” as a pure accounting unit:
- we maintain a config mapping of expected costs to credits
- budgets are enforced in credits first, with per-task hard caps as backstops


