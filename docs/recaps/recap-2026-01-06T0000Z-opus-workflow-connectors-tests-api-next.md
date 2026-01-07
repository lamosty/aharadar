# Session recap — 2026-01-06 (Opus workflow hardening + scheduler/weights/novelty + RSS/HN connectors + test plan)

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-2026-01-06T0000Z-opus-workflow-connectors-tests-api-next.md`
- **Agent/tool**: Cursor
- **Agent model**: GPT‑5.2 (task generator / reviewer)
- **Date/time (local)**: 2026-01-06
- **Session span**: 2026-01-06 → 2026-01-06
- **Repo branch**: `main`
- **Commit range (optional)**: `b62afce..99b7720`
- **Context**: We refined the “GPT plans / Opus implements” workflow (Driver Q&A gate), then Opus implemented scheduler/queue wiring + ranking features (novelty/weights/explainability) and we queued/landed the next core connectors (RSS + HN). We want to strengthen tests next, then start API/UI work.

## Goal(s) of the session

- **Primary goal**: Make the Opus task generation workflow robust (Driver Q&A gate) and keep a rolling backlog of ready-to-run tasks.
- **Secondary goals**:
  - Review Opus implementations for scheduler + ranking features.
  - Decide MVP connector priorities (RSS first; defer YouTube).
  - Prepare/land core connector tasks and a test expansion plan before starting API work.

## What changed (high level)

### 1) Workflow hardening: Driver Q&A gate is now a first-class rule

- Added a required “Driver Q&A gate” doc and wired it into the workflow so GPT‑5.2 xtra high asks decisions **before** Opus starts, then updates task specs/docs.
- Updated `AGENTS.md` to explicitly describe the “GPT plans / Opus builds / human drives” parallel workflow.

Key commits:

- `963a48a docs(workflows): add Driver Q&A gate for Opus task generation`

### 2) Scheduler + queue wiring (BullMQ) landed

- BullMQ-backed queue + worker to run pipeline jobs.
- Scheduler supports both:
  - `fixed_3x_daily` (default)
  - `since_last_run`
- Worker uses a single pipeline worker (concurrency 1) for MVP simplicity.

Key commits:

- `e2659d7 feat(worker): wire BullMQ scheduler + pipeline runner`
- `e92df17 fix(worker): address review feedback`

### 3) Ranking improvements landed: novelty + weights + review explainability

- Novelty scoring (pgvector similarity to topic history; default 30d; configurable via `NOVELTY_LOOKBACK_DAYS`).
- Source weights:
  - per-source: `sources.config_json.weight`
  - per-type: `SOURCE_TYPE_WEIGHTS_JSON`
  - effective weight = clamp(type \* source) in `[0.1, 3.0]`
- CLI review details now shows ranking breakdown from `triage_json.system_features.*`.

Key commits:

- `f95d082 feat(pipeline): add novelty feature to ranking`
- `ec2cd1c feat(cli+pipeline): source weights + bulk source admin helpers`
- `8a9ce14 feat(cli): show ranking breakdown in review details`
- `7bdb226 docs(pipeline): add TODO for novelty LATERAL batch optimization` (note: novelty currently does N queries per candidate; OK for MVP)

### 4) Budgets + signal corroboration + cadence admin UX landed (from earlier follow-ups)

Key commits:

- `39f96e0 feat(budgets): enforce credits exhaustion (warn + fallback_low)`
- `942df11 feat(pipeline): add URL-only signal corroboration boost`
- `f2a190b feat(cli): add helper to set per-source cadence`
- `a42a11a feat(cli): add bulk update + dry-run to sources-set-cadence`
- `047d024 refactor(signal): stop emitting per-post signal items` (signal is bundle-only)

### 5) Core connectors expanded: RSS + HN implemented; YouTube deferred

- Implemented RSS/Atom ingestion using `fast-xml-parser`.
- Implemented HN ingestion via the official Firebase API (stories only; no comments).
- Added hermetic unit tests for RSS parsing and HN normalization.
- YouTube ingestion intentionally deferred (channel discovery + “video content” needs a separate UX/enrichment plan).

Key commits:

- `e2da433 feat(rss): implement RSS/Atom fetch + normalization`
- `4885845 feat(hn): ingest stories via Firebase API`
- `99b7720 test(connectors): add hermetic tests for rss/hn`
- `c6af827 docs(session): lock RSS/HN connector decisions; defer youtube`

## Current state (what works / what’s broken)

- **Works**:
  - Scheduler/worker runs pipeline windows via BullMQ (`fixed_3x_daily` default; `since_last_run` available).
  - Ranking uses heuristic + triage (when enabled) + novelty + signal corroboration + source weights.
  - CLI review shows ranking breakdown and supports bulk admin commands for cadence/weights/enabled.
  - Connectors: `reddit`, `x_posts`, `signal` (bundle-only), `rss`, `hn` all exist; `rss`/`hn` are now implemented.
  - Tests are hermetic and run via `pnpm test` (currently a small set, but real).
- **Broken / TODO**:
  - `youtube` connector remains stub (intentionally deferred).
  - API package is still stubbed (`packages/api/*`).
  - Test coverage is still too low for an AI-built system (need more core-flow tests around ranking/scheduler/budgets).
  - Novelty currently runs 1 DB query per candidate vector (acceptable MVP; can batch optimize later).

## How to run / reproduce (exact commands)

- **Services**:
  - `pnpm dev:services`
- **Typecheck**:
  - `pnpm -r typecheck`
- **Build**:
  - `pnpm -r build`
- **Run worker (scheduler + queue)**:
  - `node packages/worker/dist/main.js`
- **Run pipeline (manual, dev CLI)**:
  - `pnpm dev:cli -- admin:run-now`
  - `pnpm dev:cli -- inbox --table`
  - `pnpm dev:cli -- review` (press `d` for details)
- **Tests**:
  - `pnpm test`

Key env vars (names only; no secrets):

- `DATABASE_URL=...`
- `REDIS_URL=...`
- `MONTHLY_CREDITS=...`
- `DAILY_THROTTLE_CREDITS=...` (optional)
- `DEFAULT_TIER=low|normal|high`
- `SCHEDULER_WINDOW_MODE=fixed_3x_daily|since_last_run`
- `NOVELTY_LOOKBACK_DAYS=...` (default 30)
- `SOURCE_TYPE_WEIGHTS_JSON='{"rss":1,"reddit":1,...}'` (default `{}`)

## Relevant contracts (what we relied on)

- `docs/connectors.md` — connector semantics and normalization rules
- `docs/pipeline.md` — stage order + candidate selection + ranking behavior
- `docs/budgets.md` + `docs/adr/0007-budget-units-credits.md` — credits budgeting semantics
- `docs/adr/0004-queue-redis-bullmq.md` — now Accepted (queue choice)
- `docs/adr/0009-source-cadence.md` — cadence semantics
- `docs/workflows/opus-task-generator.md` — required Driver Q&A gate

## Key files touched (high-signal only)

- `docs/workflows/opus-task-generator.md` — Driver Q&A gate checklist
- `AGENTS.md` — documents the parallel “GPT plans / Opus implements” workflow
- `packages/worker/src/main.ts`, `packages/worker/src/workers/pipeline.worker.ts`, `packages/worker/src/queues.ts` — BullMQ worker + scheduler tick
- `packages/pipeline/src/scheduler/cron.ts` — window generation logic
- `packages/pipeline/src/stages/digest.ts`, `packages/pipeline/src/stages/rank.ts`, `packages/pipeline/src/scoring/novelty.ts` — ranking features
- `packages/cli/src/commands/admin.ts`, `packages/cli/src/commands/review.ts`, `packages/cli/src/main.ts` — admin UX + explainability UI
- `packages/connectors/src/rss/*`, `packages/connectors/src/hn/*` — new canonical connectors
- Tests:
  - `packages/pipeline/src/stages/ingest.test.ts`
  - `packages/connectors/src/x_posts/normalize.test.ts`
  - `packages/connectors/src/rss/parse.test.ts`
  - `packages/connectors/src/hn/normalize.test.ts`

## Commit log (what to look at)

- `963a48a docs(workflows): add Driver Q&A gate for Opus task generation`
- `39f96e0 feat(budgets): enforce credits exhaustion (warn + fallback_low)`
- `e2659d7 feat(worker): wire BullMQ scheduler + pipeline runner`
- `f95d082 feat(pipeline): add novelty feature to ranking`
- `ec2cd1c feat(cli+pipeline): source weights + bulk source admin helpers`
- `8a9ce14 feat(cli): show ranking breakdown in review details`
- `e2da433 feat(rss): implement RSS/Atom fetch + normalization`
- `4885845 feat(hn): ingest stories via Firebase API`
- `99b7720 test(connectors): add hermetic tests for rss/hn`

## Key decisions (locked — do not re-ask in next GPT window)

- **Signal semantics**: `signal` is **bundle-only** for now (no `signal_post_v1` emission); `x_posts` is canonical X ingestion.
- **Signal corroboration**: URL-only; ignore X-like URLs (`x.com`, `twitter.com`, `t.co`); boost only external content.
- **Migration stance**: local/dev = **reset + re-ingest** (no backfill tooling by default).
- **Cadence UX**: CLI supports both per-source and bulk by topic + source-type, with `--dry-run`.
- **Cluster representative heuristic**: prefer titled items when selecting cluster representatives (avoid tweet-as-face).
- **Budget accounting**: credits sum uses `provider_calls.status='ok'` only; daily throttle boundaries use **UTC** for now.
- **Budget exhaustion behavior**: skip paid calls but keep ingesting free sources and produce heuristic-only digests; UI/API must clearly message “degraded mode” to avoid user confusion.
- **Scheduler/queue**: Redis + BullMQ is the MVP choice (ADR 0004 Accepted). Scheduler window mode configurable; `fixed_3x_daily` exists, but **UI default should be `since_last_run`**.
- **Ranking weights**: `wNovelty=0.05`, `wSignal=0.05` (small); source weights clamp to `[0.1, 3.0]`; type weights default 1.0 with optional `SOURCE_TYPE_WEIGHTS_JSON`.
- **YouTube**: deferred for now; keep connector stubbed; “video content” beyond title/description implies transcripts (future, budget-aware).
- **CI**: skip GitHub PR/CI work for now (no PR workflow yet).
- **Testing strategy**: keep `pnpm test` **hermetic + fast** (unit tests), and add a separate `pnpm test:integration` later that requires Docker services.

## What’s next (ordered)

1. **Expand unit tests for “core flow” logic (highest ROI for AI-built code)**:
   - `packages/pipeline/src/stages/rank.ts`: score math, weights parsing, clamping, deterministic ordering
   - `packages/pipeline/src/scheduler/cron.ts`: fixed windows + since_last_run window generation
   - budget gating behavior (credits exhaustion → triage skipped; heuristic-only digest still works)
2. **Add more hermetic connector tests as connectors expand**:
   - RSS edge cases (missing dates, content:encoded vs description)
   - HN normalization edge cases
3. **Optional (later): add integration tests**:
   - new `pnpm test:integration` that runs against local Postgres+pgvector + Redis (Docker)
   - validate end-to-end pipeline run: ingest → embed → dedupe → cluster → digest
4. **Then start API work** (new GPT window):
   - implement `packages/api` (currently stubbed)
   - pick modern auth approach (to decide in API planning; avoid re-asking the locked decisions above)
   - ensure API defaults match UI expectation: “since_last_run” semantics and clear budget-degraded messaging

## Open questions / decisions needed (for the API planning window)

- **API auth**: decide the MVP auth scheme (“proper standards for 2025”):
  - API key header vs session auth vs OAuth (likely API key for MVP, but decide explicitly in API planning).
- **Budget-degraded UX**: exact copy + UI behavior when heuristics-only (show a banner/warning so users don’t judge the full system on degraded mode).
- **Integration tests**: when to introduce `pnpm test:integration` (now vs after API).
