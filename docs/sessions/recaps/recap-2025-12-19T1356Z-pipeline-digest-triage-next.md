# Session recap — 2025-12-19 (pipeline digest + source filtering + Reddit constraints; next: LLM triage)

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-2025-12-19T1356Z-pipeline-digest-triage-next.md`
- **Agent/tool**: Cursor
- **Agent model**: GPT-5.2
- **Date/time (local)**: 2025-12-19 14:58
- **Session span**: 2025-12-19 → 2025-12-19
- **Repo branch**: `main`
- **Context**: Handoff recap so a fresh AI agent can continue. Focus was getting real non-signal ingestion (Reddit), adding a minimal “persisted digest” pipeline slice, and clarifying Reddit data access constraints + the next step: LLM triage as the core “aha” intelligence.

## Goal(s) of the session

- Primary goal: Start the pipeline in a useful, testable way (ingest → persist digest → view in CLI).
- Secondary goals:
  - Add enough connector/CLI UX to iterate quickly (create sources, run subsets, avoid expensive re-fetch).
  - Resolve Reddit access ambiguity (OAuth approval gate vs public endpoints) and record learnings.
  - Decide next slice: implement LLM triage (Aha Score) rather than over-investing in heuristics.

## What changed (high level)

- **Reddit connector (MVP)**:
  - Implemented Reddit fetch+normalize using public JSON listings with explicit User-Agent.
  - Supports `listing: new|top|hot`, incremental cursoring for `new`, optional top-comments enrichment.
  - Note: OAuth path was attempted, then reverted due to late-2025 approval constraints.

- **Admin/dev CLI improvements**:
  - Add sources without manual SQL: `admin:sources-add`, `admin:sources-list`.
  - Control ingest volume: `admin:run-now --max-items-per-source N`.
  - Run only some sources/types: `admin:run-now --source-type ...` and `--source-id ...`.
  - **Digest-only runs** (no refetch): `admin:digest-now` rebuilds digest from existing DB items.

- **Pipeline: persisted digest (first real downstream stage)**:
  - After ingest, pipeline persists a digest snapshot (`digests` + `digest_items`) for the window.
  - Current ranking is heuristic (cheap baseline): recency + light engagement when present.
  - CLI `inbox` shows the latest digest (ranked) instead of “latest raw items”.

- **Docs / learnings**:
  - Added research notes: `docs/learnings/reddit-data-access-late-2025.md` (approval gate, commercial terms, reliability).

## Current state (what works / what’s broken)

- **Works**:
  - End-to-end flow: create sources → ingest → persist digest → view digest in CLI.
  - Per-run source filtering enables: run `reddit` several times/day while running `signal` explicitly (and signal connector also has internal “once per day” gating).
  - Digest recompute without network fetch (fast iteration on ranking changes): `admin:digest-now`.

- **Broken / TODO**:
  - **No LLM triage yet** (the main product intelligence per `docs/llm.md` / `docs/pipeline.md`).
  - Embeddings/clustering/rank/feedback loop stages are still not implemented (stubs exist).
  - Budget enforcement/ledger is not implemented beyond per-run caps and provider call logging for signals.

## How to run / reproduce (exact commands)

- **Services**:
  - `./scripts/dev.sh`
- **Migrations**:
  - `./scripts/migrate.sh`

- **Create sources (examples)**:
  - Reddit:
    - `pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:wallstreetbets:top-day" --config '{"subreddits":["wallstreetbets"],"listing":"top","time_filter":"day"}'`
    - `pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:Bitcoin:top-day" --config '{"subreddits":["Bitcoin"],"listing":"top","time_filter":"day"}'`
  - Signals:
    - (existing signal sources from earlier setup; debug via `admin:signal-debug`)

- **Ingest**:
  - Run only Reddit (more frequent):
    - `pnpm dev:cli -- admin:run-now --source-type reddit --max-items-per-source 200`
  - Run only signals (expensive, 1×/day):
    - `pnpm dev:cli -- admin:run-now --source-type signal`

- **Digest only (no ingest / no network fetch)**:
  - Rebuild digest from stored items:
    - `pnpm dev:cli -- admin:digest-now --source-type reddit,signal --max-items 20`

- **View latest digest**:
  - `pnpm dev:cli -- inbox`

- **Key env vars** (names only; no secrets):
  - Core: `DATABASE_URL`, `REDIS_URL`, `MONTHLY_CREDITS`, `DEFAULT_TIER`
  - Signals (xAI/Grok): `GROK_API_KEY` or `SIGNAL_GROK_API_KEY`, `GROK_BASE_URL` or `SIGNAL_GROK_BASE_URL`, `SIGNAL_GROK_MODEL`
  - Optional signal knobs: `SIGNAL_MAX_SEARCH_CALLS_PER_RUN`, `SIGNAL_CREDITS_PER_CALL`

## Relevant contracts (what we relied on)

- `docs/connectors.md` — connector contracts; `signal` bundle semantics; Reddit config/cursor expectations.
- `docs/pipeline.md` — stage order; digest persistence contract; where triage/rank/LLM fits.
- `docs/data-model.md` — `content_items`, `fetch_runs`, `digests`, `digest_items`, `provider_calls`.
- `docs/llm.md` — triage schema (`triage_v1`) and strict JSON requirements (provider-agnostic).
- ADR `docs/adr/0005-llm-provider-abstraction.md` — provider-agnostic LLM routing approach.

## Key files touched (high-signal only)

- `packages/connectors/src/reddit/*` — Reddit fetch/normalize/config (public JSON MVP).
- `packages/cli/src/commands/admin.ts` — `admin:sources-*`, `admin:run-now` filtering, `admin:digest-now`.
- `packages/cli/src/commands/inbox.ts` — display latest digest (`digest_items`) instead of raw items.
- `packages/pipeline/src/stages/ingest.ts` — optional filter support for per-run source selection.
- `packages/pipeline/src/stages/digest.ts` — digest persistence + heuristic scoring baseline.
- `packages/db/src/repos/digests.ts`, `packages/db/src/repos/digest_items.ts` — DB accessors for digest persistence.
- `docs/learnings/reddit-data-access-late-2025.md` — research notes on Reddit API approval/commercial constraints.

## Commit log (what to look at)

Recent commits since the prior recap (newest first):

- `5be8072 feat(cli): add digest-only admin command`
- `f9b1161 docs(learnings): add Reddit data access notes`
- `fd6c4ad feat(pipeline): persist heuristic digests from ingested items`
- `b2d58d7 feat(cli): allow admin:run-now to filter sources by type/id`
- `9592a46 fix(connectors): revert reddit to public JSON endpoints for MVP`
- `da8485a feat(cli): add admin source tooling and ingest cap override`
- `655cac0 feat(connectors): implement reddit ingestion via OAuth Data API` (superseded by the revert)
- `1ae2909 docs(sessions): recap 2025-12-19 signal debug + daily cadence + prettier`

## What’s next (ordered)

1. **Implement LLM triage stage (core “aha” intelligence)**:
   - Build `@aharadar/llm` package (router + provider client(s)) per `docs/llm.md` + ADR 0005.
   - Add pipeline stage to call triage for digest candidates and store `digest_items.triage_json` (schema `triage_v1`).
   - Make `aha_score` the primary ranking input; keep recency/engagement as tie-breakers.
   - Record every call in `provider_calls` with a credits estimate (best-effort).

2. **Budget enforcement (minimal viable)**:
   - Implement “per run caps” for triage calls (top K) and optionally per-day caps for signals.
   - Add “warn + fallback to low” behavior when credits are low (per `docs/budgets.md`).

3. **Feedback loop (optional after triage)**:
   - Even if sources are narrow (so relevance is high), feedback is still valuable for personalization.
   - But it’s not required to prove “aha discovery” once triage exists; can follow later.

4. **Reduce Reddit dependency risk**:
   - Treat Reddit ingestion as best-effort in MVP (public JSON), but prioritize other stable canonical sources (RSS, YouTube, HN) if commercial constraints tighten.

## Open questions / decisions needed

- **LLM provider for triage**: OpenAI vs xAI vs other (must remain provider-agnostic in code).
- **Triage volume/cost**: how many candidates per run should be triaged by default (top K)? (Start conservative.)
- **Signal vs canonical**: keep both eligible for triage/ranking, but decide whether to add a soft cap/weight if all-signal digests become common (or let triage decide entirely).

## Optional: work log / gotchas

- TypeScript monorepo gotcha: when adding methods to `@aharadar/db` or `@aharadar/pipeline`, consumers may see stale `.d.ts` during `typecheck`. Fix by rebuilding the dependency first:
  - `pnpm --filter @aharadar/db build`
  - `pnpm --filter @aharadar/pipeline build`

