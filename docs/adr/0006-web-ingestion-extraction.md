# ADR 0006: Web page ingestion strategy (RSS-first + pluggable extraction)

- **Status**: Deferred (v2)
- **Date**: 2025-12-17

## Context

We want to ingest content from blogs/news outlets where RSS/Atom is missing or incomplete.

Constraints:

- avoid ToS violations and paywall bypassing
- keep ingestion reliable and budgetable
- keep architecture modular (swap extraction/discovery implementations)

## Decision

Adopt a **RSS-first** posture:

1. If a site provides RSS/Atom → use the `rss` connector.
2. Otherwise use a `web` connector that is **semi-generic**:
   - discovery from configured seed/listing pages (or sitemap)
   - extraction using deterministic “article text extraction” (Readability-style) plus JSON-LD/OpenGraph

Make extraction/discovery pluggable behind interfaces:

- `PageDiscovery` (seed pages, sitemap, link scraping, optional headless)
- `PageExtractor` (readability, structured-data, optional external providers)

## Consequences

- We can cover “a lot of the web” for public pages without hardcoding each site.
- We acknowledge limits: some sites will require custom rules, JS rendering, or will be blocked.
- We keep a clean upgrade path:
  - add headless rendering in dial-up mode
  - add paid extraction vendors behind the same interfaces

## Alternatives considered

- “Full web crawler” approach: too complex/risky for MVP.
- External extraction vendor only: faster, but introduces vendor lock-in and cost uncertainty.
