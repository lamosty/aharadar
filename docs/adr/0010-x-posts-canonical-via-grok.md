# ADR 0010: X/Twitter as canonical content (`x_posts`) via a provider (default: Grok)

- **Status**: Accepted
- **Date**: 2026-01-05

## Context

We want high-quality, high-signal content from X/Twitter posts in the product.

MVP constraints:

- Official X APIs are not currently usable at a “normal” price point for this project.
- We still need provider-agnosticism (a swap later should not require refactoring pipeline core).
- We need budget/cadence controls so X does not dominate cost or overwhelm the user.

Previously (ADR 0003), we treated X primarily as a **signal amplifier** (derived search/trend ingestion). In practice, tweet-level content often _is_ the meaningful unit we want to read/review.

## Decision

Introduce a canonical connector:

- `type = "x_posts"` — canonical ingestion of post-level items

Use a provider-backed access method initially:

- default vendor: Grok (via an abstraction so this can be swapped later)

Keep `type = "signal"` as a separate concept for derived alert/trend semantics (amplifiers), not canonical ingestion.

### Cadence control (important)

`x_posts` sources MUST rely on the generic per-source cadence mechanism (ADR 0009) so that:

- you can run digests multiple times per day, but fetch X posts only once per day (or other chosen interval).

## Consequences

- Tweet-level items become first-class `content_items` and flow through embeddings, clustering, ranking, and digests like other canonical sources.
- We reduce “special casing” downstream (signals-as-evidence can be a later UX choice, not a storage constraint).
- We retain a clean escape hatch: when official X APIs become feasible, only the `x_posts` connector implementation changes.

## Migration / rollout notes

- Early-phase preference: avoid silent backward-compat logic for older stored rows.
- Prefer explicit migration/backfill commands or (in local dev) resetting and re-ingesting sources after the connector is implemented.

## Follow-ups

- Update connector specs in `docs/connectors.md` to define `x_posts` config/cursor/normalize.
- Update pipeline spec in `docs/pipeline.md` to clarify how `x_posts` interacts with signals and cadence gating.
