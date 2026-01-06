# Session recap — 2026-01-03 (embeddings + semantic search + topic personalization)

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-2026-01-03T2001Z-embeddings-search-personalization.md`
- **Agent/tool**: Cursor
- **Agent model**: GPT-5.2
- **Date/time (local)**: 2026-01-03
- **Session span**: 2026-01-03 → 2026-01-03
- **Repo branch**: `main`
- **Commit range (optional)**: `db1ca8d..17b7ef1`
- **Context**: We turned the “next: embeddings” plan into working end-to-end code: embeddings in Postgres (pgvector), topic-scoped semantic search, and the first visible personalization loop driven by review feedback.

## Goal(s) of the session

- **Primary goal**: Implement embeddings end-to-end (DB → pipeline → CLI) and make them usable via semantic search.
- **Secondary goals**:
  - Improve dev UX around defaults/limits (avoid surprising `20` caps).
  - Start the feedback → embeddings → personalization loop (topic-scoped) and make it visible in the review UI (“why shown”).

## What changed (high level)

### 1) Embeddings end-to-end (DB + pipeline + CLI)

- Implemented an embeddings client in `@aharadar/llm` (OpenAI-compatible `/v1/embeddings`).
- Implemented a real pipeline embed stage (`packages/pipeline/src/stages/embed.ts`) and wired it into `runPipelineOnce` (ingest → embed → digest).
- Added `admin:embed-now` (embed existing content without re-running ingest) and implemented `cli search` as topic-scoped semantic search over pgvector.
- Added `.env.example` and updated `docs/llm.md` to document embeddings-related env vars (names only).

### 2) Dev UX / “limits” cleanup

- Fixed the common `.env` pitfall: inline comments like `FOO=bar # comment` used to poison values (e.g. OpenAI model IDs). CLI `.env` loader now strips inline `#` comments for unquoted values.
- Made `admin:digest-now` default to the same dev-friendly sizing as `admin:run-now`: “all candidates (capped)”, rather than silently defaulting to 20.

### 3) Topic-scoped personalization loop (feedback + embeddings)

- Added `topic_preference_profiles` (topic-scoped preference vectors) via migration + db repo.
- Review loop now (best-effort) updates the topic preference profile on `like/save/dislike`, using the item’s embedding.
- Digest scoring now includes a small preference similarity term (when embeddings + profile vectors exist).
- Review details (`w`) now shows embedding-based “why shown”:
  - similarity to the topic preference profile (pos/neg)
  - top 1–3 most similar liked/saved items (topic-scoped)

## Current state (what works / what’s broken)

- **Works**:
  - `admin:embed-now` backfills embeddings for existing items (topic-scoped).
  - `search` runs topic-scoped semantic search using pgvector similarity.
  - Review feedback persists to `feedback_events` and updates `topic_preference_profiles` (best-effort).
  - `admin:digest-now` now defaults to “all candidates (capped)” like `run-now`.
  - Review details show embedding-based “why shown” data.
- **Broken / TODO**:
  - No clustering/dedupe stage beyond URL dedupe; embeddings exist but clustering isn’t implemented yet.
  - Budget ledger/enforcement is still “best effort” (provider_calls logging exists; full credits enforcement policy not wired end-to-end).
  - Embedding dims are currently fixed at 1536 (`vector(1536)`); switching to models returning different dims needs deliberate work (migration and/or embeddings API dimension parameter support).

## How to run / reproduce (exact commands)

- **Services**:
  - `./scripts/dev.sh`
- **Migrations**:
  - `./scripts/migrate.sh`
- **Env**:
  - `cp .env.example .env` (then set secrets locally; do not commit `.env`)
- **Backfill embeddings only (no ingest/digest)**:
  - `pnpm dev:cli -- admin:embed-now --topic <id-or-name>`
- **Run ingest → embed → digest**:
  - `pnpm dev:cli -- admin:run-now --topic <id-or-name>`
- **Recompute digest without ingest (autosized by default)**:
  - `pnpm dev:cli -- admin:digest-now --topic <id-or-name>`
- **Review (topic-scoped; press `w` for details/why-shown)**:
  - `pnpm dev:cli -- review --topic <id-or-name>`
- **Semantic search**:
  - `pnpm dev:cli -- search --topic <id-or-name> "your query"`

## Key env vars (names only; no secrets)

- Core:
  - `DATABASE_URL`, `REDIS_URL`, `MONTHLY_CREDITS`, `DEFAULT_TIER`
- LLM triage (OpenAI-compatible Responses API):
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL` or `OPENAI_ENDPOINT`
  - `OPENAI_TRIAGE_MODEL(_LOW/_NORMAL/_HIGH)`
- Embeddings (OpenAI-compatible):
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL` or `OPENAI_EMBED_ENDPOINT`
  - `OPENAI_EMBED_MODEL(_LOW/_NORMAL/_HIGH)`
  - Optional caps: `OPENAI_EMBED_MAX_ITEMS_PER_RUN`, `OPENAI_EMBED_BATCH_SIZE`, `OPENAI_EMBED_MAX_INPUT_CHARS`
- Signals (optional):
  - `SIGNAL_GROK_API_KEY` / `GROK_API_KEY`
  - `SIGNAL_GROK_BASE_URL` / `GROK_BASE_URL` or `SIGNAL_GROK_ENDPOINT`
  - `SIGNAL_GROK_MODEL`

## Relevant contracts (what we relied on)

- `docs/spec.md` — FR‑013 embeddings, FR‑014 semantic search, FR‑016 feedback → preference profile (topic-scoped per ADR 0008).
- `docs/data-model.md` — `embeddings` table + topic-scoped `topic_preference_profiles`.
- `docs/pipeline.md` — stage order + feedback loop integration + preference similarity feature.
- `docs/llm.md` — provider-agnostic stance + runtime env vars (now includes embeddings env vars).
- `docs/cli.md` — CLI behavior (search, review, admin commands) + “why shown” expectations.
- ADR `docs/adr/0008-topics-collections.md` — topic-scoped behavior is non-negotiable; personalization should be per topic.

## Key files touched (high-signal only)

- DB:
  - `packages/db/src/repos/embeddings.ts` — embeddings upsert + list candidates
  - `packages/db/migrations/0003_topic_preference_profiles.sql` — topic preference vectors
  - `packages/db/src/repos/topic_preference_profiles.ts` — read/update preference profiles
- LLM:
  - `packages/llm/src/embeddings.ts`, `packages/llm/src/openai_embeddings.ts` — OpenAI-compatible embeddings client
- Pipeline:
  - `packages/pipeline/src/stages/embed.ts` — embed stage + `provider_calls` logging
  - `packages/pipeline/src/stages/digest.ts` — preference similarity feature (when profile+embedding exist)
- CLI:
  - `packages/cli/src/commands/search.ts` — semantic search
  - `packages/cli/src/commands/admin.ts` — `admin:embed-now` + autosized `admin:digest-now`
  - `packages/cli/src/commands/review.ts` — updates preference profile + shows embedding-based why-shown details
  - `packages/cli/src/main.ts` — `.env` parsing improvements + command wiring
- Docs:
  - `.env.example`
  - `docs/llm.md`, `docs/cli.md`, `docs/data-model.md`, `docs/pipeline.md`

## Commit log (what to look at)

Recent commits since last recap:

- `17b7ef1 feat(cli): show embedding-based why-shown in review details`
- `eacd420 fix(cli): handle inline # comments in .env values`
- `f1efe97 fix(cli): autosize admin:digest-now like run-now`
- `654f225 docs(data-model): add topic preference profiles`
- `7465894 feat(personalization): update topic preference profiles from feedback`
- `651a31d docs(env): add .env.example and embeddings vars`
- `484c1c0 feat(embeddings): add embed-now + semantic search`

## What’s next (ordered)

1. **Make personalization visible in inbox**:
   - Show `pref_sim` (and optionally top similar likes) in `inbox` cards/table view, not only in review details.
2. **Move preference updates out of CLI** (optional but cleaner):
   - Add a pipeline stage or worker job that processes `feedback_events` and updates `topic_preference_profiles` deterministically (idempotent), rather than doing it in the interactive CLI.
3. **Implement clustering + dedupe using embeddings**:
   - Add topic-scoped clustering (per `docs/pipeline.md`) and start emitting cluster-based digests (not just single items).
4. **Budget enforcement**:
   - Convert `provider_calls.cost_estimate_credits` into a real enforced monthly/daily budget policy (tier dial-down + “no paid calls” behavior when exhausted).
5. **Decide on embedding model evolution**:
   - If you want `text-embedding-3-large`, decide whether to:
     - migrate schema to `vector(3072)`, or
     - support embeddings API dimension overrides, or
     - store multiple embeddings per content item (more complex).

## Open questions / decisions needed

- Should preference profiles be updated:
  - synchronously in the CLI (current), or
  - in the pipeline/worker (more robust, less UI coupling)?
- Do we keep a global `user_preference_profiles` table at all, or fully switch to `topic_preference_profiles`?
- Do we want embedding model tiering (low/normal/high) for embeddings, or keep embeddings model constant across tiers to avoid churn?
