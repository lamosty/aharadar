# ADR 0003: X/Twitter — “Signal source” via a search provider (default: Grok)

- **Status**: Accepted
- **Date**: 2025-12-17

## Context

We want some of the “what’s happening right now” value of X/Twitter, but MVP constraints are:

- avoid full-firehose ingestion (cost, complexity, policy risk)
- avoid requiring user account linking/OAuth for public sources in MVP
- keep budget dial effective: X should not dominate spend

## Decision

Treat X/Twitter as a **signal amplifier** via a **search provider** (default: Grok X Search at time of writing):

- Ingest **summarized signals** rather than attempting to store every tweet.
- Normalize signals into `content_items` with `source_type = "signal"` (and store provider/vendor info in metadata).
- Prefer to extract and store:
  - a short, structured “what’s the signal?” description
  - entities/tickers/people mentioned
  - **URLs** referenced in results (which can later be ingested via RSS/web/other connectors)

Identifiers and cursoring (Proposed):

- If provider returns stable tweet IDs: use them in `external_id`.
- If not: generate a stable synthetic `external_id` (hash of `(query, primary_url, time_bucket)`).
- Cursor uses:
  - `since_id` if supported, else
  - `since_time` (ISO timestamp) + dedupe by `external_id`

## Consequences

- We will miss some content that would be visible in a full ingest, but MVP remains cheap and robust.
- X-derived items should often point to canonical URLs on the open web, allowing the rest of the system (dedupe/clustering) to converge on non-X sources.
- We keep a provider interface so we can swap Grok → official X API (or other vendors) later without core refactors.

## Future path (no-refactor)

If X provides a normal pay-as-you-go REST API suitable for canonical ingestion, add a separate canonical connector:

- `type = "x_posts"` (fetch posts/timelines like other content sources)
- keep `type = "signal"` for search/trend/alerts ingestion (still useful for amplification)

## Alternatives considered

- Full X ingest: high cost, high ToS/policy complexity, hard to make budget-predictable.
- No X at all in MVP: simplest, but loses a valuable “early signal” channel.
