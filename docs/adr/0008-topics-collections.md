# ADR 0008: Topics/Collections — user-defined source groups + topic-scoped digests/review

- **Status**: Accepted
- **Date**: 2026-01-02

## Context

The product is **topic-agnostic** (no domain-specific hardcoding), but a single user may have **multiple unrelated interest areas** (e.g. programming, vehicles, policy, etc.). A single mixed digest/review queue creates context switching and “noise”.

We want to preserve the MVP UX goal: a fast **tinder-like review loop** (like/dislike/save/skip), while letting the user review one interest area at a time.

There is also a data-model constraint:

- `content_items` are **deduped by canonical URL hash** across sources.
- Therefore, a single `content_item` may be “seen” via multiple sources over time.
- If “topics” are implemented only as `sources.topic_id`, naive topic filtering via `content_items.source_id` would be incorrect when an item is deduped/merged.

## Decision

Introduce **Topics** (aka **Collections**) as a user-defined grouping primitive:

- A **topic** is a user-defined container of sources (unrestricted naming/semantics).
- Pipeline runs and digests are **topic-scoped** (one digest per topic per window).
- The CLI review loop remains “swipe-simple”, but operates on a **selected topic**.

To preserve topic membership and provenance even with URL dedupe:

- Add a lightweight association table `content_item_sources(content_item_id, source_id)` that records every `(content_item, source)` relationship as items are ingested/upserted.
- Topic candidate selection uses `content_item_sources → sources(topic_id)` rather than `content_items.source_id`.

## Consequences

- **No domain assumptions** are introduced: topics are user-defined labels/collections.
- Digests and feedback become naturally **partitioned by topic**, improving focus.
- Later, embeddings/personalization can be implemented **per topic** without changing the review UX or feedback storage.
- A single content item can appear in multiple topics (via `content_item_sources`) without duplicating storage.

## Non-goals (for this ADR)

- Automatic topic classification/routing for mixed sources (future).
- Multi-user UI/account management (future).
- Per-topic credit pools (budgets remain per user initially).

## Follow-ups

- Update `docs/data-model.md`, `docs/pipeline.md`, and `docs/cli.md` to reflect topic-scoped behavior.
- Implement DB migration + repos + CLI topic tooling.


