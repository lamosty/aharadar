# Opus worklist (current) — canonical `x_posts` + per-source cadence

This file is the **active queue** of tasks to hand to Claude Code Opus 4.5.

Workflow: follow `docs/workflows/ai-collab.md`.

## Pre-req (do once)

Commit the planning docs/ADRs first (if not already committed):

- `docs/_session/opus-implementation-x_posts-and-cadence.md`
- `docs/adr/0009-source-cadence.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/adr/0003-x-strategy-grok-signal.md` (marked superseded)

## Execution strategy

For these “core plumbing” tasks, run **one Opus instance at a time** (recommended). Parallel work is possible but not required.

Every task below must end with:
- `pnpm -r typecheck`
- a CLI smoke test
- printing the **GPT‑5.2 review prompt** (see task specs)

---

## Task 1 — Cadence gating in ingest

### Task: `feat(pipeline): gate ingestion by per-source cadence`

**Goal**
Implement the generic per-source cadence gating described in ADR 0009.

**Read first**
- `docs/adr/0009-source-cadence.md`
- `packages/pipeline/src/stages/ingest.ts`

**Scope (allowed files)**
- `packages/pipeline/src/stages/ingest.ts` (and optionally a small helper file in the same directory)

**Implementation steps**
1. Parse optional `config_json.cadence`:
   - supported shape (MVP): `{ "mode": "interval", "every_minutes": <positive int> }`
2. Parse `cursor_json.last_fetch_at` (ISO string).
3. Use `windowEnd` as `now` for determinism.
4. If not due:
   - do **not** call `connector.fetch()`
   - do **not** update cursor
   - do **not** record provider_calls
   - return a per-source result with `status="ok"` and 0 counts
5. If due and fetch succeeds (`ok|partial`):
   - update cursor with `last_fetch_at: windowEnd` merged into `nextCursor`

**Acceptance criteria**
- A source with `cadence.every_minutes=1440` fetches at most once per day even if pipeline runs multiple times.
- `last_fetch_at` updates only on successful fetch (not on skip).
- No behavior changes for sources without cadence config.

**Test plan**
```bash
pnpm -r typecheck
pnpm dev:cli -- admin:run-now --source-type <any-type-you-have> --max-items-per-source 1
pnpm dev:cli -- admin:run-now --source-type <same-type> --max-items-per-source 1
```

**Commit**
- `feat(pipeline): gate ingestion by per-source cadence`

**Final step**
Print the GPT‑5.2 review prompt (see `docs/workflows/ai-collab.md`).

---

## Task 2 — Reusable Grok X search provider module

### Task: `refactor(connectors): extract grok x_search provider for reuse`

**Goal**
Move Grok X search request/response parsing into a shared module without changing behavior.

**Read first**
- `packages/connectors/src/signal/provider.ts`
- `packages/connectors/src/signal/fetch.ts`

**Scope**
- `packages/connectors/src/signal/provider.ts`
- new shared module (suggested): `packages/connectors/src/x_shared/grok_x_search.ts`
- minimal import adjustments if required

**Acceptance criteria**
- `pnpm -r typecheck` passes
- `pnpm dev:cli -- admin:run-now --source-type signal` still works (if you have env configured)

**Commit**
- `refactor(connectors): extract grok x_search provider for reuse`

**Final step**
Print the GPT‑5.2 review prompt.

---

## Task 3 — Add `x_posts` connector scaffold + registry

### Task: `feat(connectors): add x_posts connector scaffold`

**Goal**
Create a new connector `type="x_posts"` that compiles and is registered (fetch can return empty initially).

**Read first**
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/connectors.md` (x_posts spec)
- `packages/connectors/src/registry.ts`
- `packages/connectors/src/types.ts`

**Scope**
- new: `packages/connectors/src/x_posts/*`
- `packages/connectors/src/registry.ts`
- (only if needed) shared SourceType union in `@aharadar/shared`

**Acceptance criteria**
- Pipeline does not error with “No connector registered” when a source has `type="x_posts"`
- `pnpm -r typecheck` passes

**Commit**
- `feat(connectors): add x_posts connector scaffold`

**Final step**
Print the GPT‑5.2 review prompt.

---

## Task 4 — Implement `x_posts` fetch (post-level raw items)

### Task: `feat(x_posts): fetch post-level raw items via provider`

**Goal**
Use the provider to fetch post results and emit **one raw item per post** (not bundles).

**Depends on**
- Task 2 and Task 3

**Acceptance criteria**
- Creating an `x_posts` source results in new `content_items` once normalize is implemented (Task 5).
- Fetch respects `limits.maxItems` and cursors best-effort.

**Commit**
- `feat(x_posts): fetch post-level raw items via provider`

**Final step**
Print the GPT‑5.2 review prompt.

---

## Task 5 — Implement `x_posts` normalize (canonical content items)

### Task: `feat(x_posts): normalize posts into canonical content_items`

**Goal**
Normalize each post into a canonical content item:
- canonical URL is status URL
- external id is status id (preferred)
- title null; body_text is excerpt; author `@handle` best-effort
- published_at null unless true timestamp exists

**Acceptance criteria**
- Items flow through embedding → dedupe/cluster → digest like other canonical sources.
- No fabricated timestamps.

**Commit**
- `feat(x_posts): normalize posts into canonical content_items`

**Final step**
Print the GPT‑5.2 review prompt.

---

## Task 6 — Tests (we don’t have them yet)

### Task: `test: add minimal unit tests for cadence + x_posts parsing`

**Goal**
Add a minimal test runner and a few high-signal tests:
- cadence “due” logic
- URL/status-id parsing for `x_posts`

**Notes**
Keep it minimal (fast to run); do not add heavy infra.

**Commit**
- `test: add minimal unit tests for cadence + x_posts parsing`

**Final step**
Print the GPT‑5.2 review prompt.

---

## Backlog (don’t start until x_posts + cadence land)

- Prefer canonical cluster representatives in digests (avoid tweet-as-face when canonical exists).
- URL-only “signal corroboration” boost (optional ranking feature; keep explainable/deterministic).
- Budget hard enforcement (skip paid calls when credits exhausted; tier dial-down).
- Real scheduler/queue orchestration (BullMQ + cron windows).


