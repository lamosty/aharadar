# Aha Radar — Docs Index (working set)

This repo is currently **spec-first**. The goal is to lock down concrete MVP contracts (schemas, stage order, budgets, connector cursors, CLI/API behavior) before writing code.

## Reading order (recommended)

0. `../AGENTS.md` — AI agent entrypoint (fast context + working rules).
1. `spec.md` — product/technical master spec (high level).
2. `architecture.md` — concrete system decomposition + runtime data flow.
3. `data-model.md` — database schema contract (tables, constraints, indexes).
4. `pipeline.md` — pipeline stage order + idempotency + budgets.
5. `connectors.md` — connector contracts + per-source cursor/config specs.
6. `llm.md` — LLM tasks (provider-agnostic), prompts, JSON output schemas, retry rules.
7. `budgets.md` — budget dial config + enforcement policy.
8. `cli.md` — MVP review-queue UX + keybindings + commands.
9. `api.md` — optional minimal HTTP API contract (if we expose it in MVP).
10. `adr/*` — decisions and tradeoffs; where we lock choices.
11. `sessions/*` — session recaps / audit log for AI-assisted development (handoff notes).

## Status legend

- **Proposed**: documented, not yet confirmed.
- **Accepted**: confirmed by you; implementation should follow it.
- **Superseded**: replaced by a newer ADR.

## Decision checklist (please confirm / edit)

These are the key “we can’t code until this is decided” items.

### MVP surface area

- **MVP UI**: CLI-only vs CLI + minimal web viewer
- **MVP sources**: small starter set vs broad with strict caps

### Scheduling & windows

- **Default schedule**: fixed 3× daily vs templates
- **Digest window semantics**: fixed windows vs “since last run”

### Budget defaults

- **Budget input**: credits (multi-currency pricing can be layered later), and whether tier is manual or derived
- **Monthly cap target** and **daily cap translation** (how monthly → daily)
- **Allocation**: % budget to embeddings vs triage vs deep summary vs signals

### Key implementation choices

- **Queue**: Redis + BullMQ vs Postgres-only job queue
- **HN ingestion**: Firebase API vs Algolia vs RSS-ish proxies
- **YouTube ingestion**: channel RSS + optional transcript fetch vs Data API
- **Web ingestion**: deferred to v2 (keep ADR; not MVP)
- **Embedding model**: “small” (cheaper) vs “large” (better retrieval)

If you tell me your preferences on the above, I’ll update the ADRs to **Accepted** and remove alternatives.
