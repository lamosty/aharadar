# Session recap — 2026-01-03 (topics + review loop; next: embeddings)

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-2026-01-03T1239Z-topics-review-embeddings-next.md`
- **Agent/tool**: Cursor
- **Agent model**: GPT-5.2
- **Date/time (local)**: 2026-01-03
- **Session span**: 2026-01-03 → 2026-01-03
- **Repo branch**: `main`
- **Context**: We added a real CLI review/feedback loop, introduced user-defined Topics/Collections to avoid cross-interest noise, and made dev runs less confusing. Next agent should focus on embeddings + everything downstream.

## Goal(s) of the session

- **Primary goal**: Implement the “tinder-like” CLI review loop and persist feedback events.
- **Secondary goals**:
  - Add user-defined topics/collections and make digests + review topic-scoped.
  - Fix dev UX issues (digest default size, review resume behavior).
  - Leave the repo in a clean state for an embeddings-focused next session.

## What changed (high level)

### 1) Review loop + feedback persistence (CLI)

- Implemented interactive `aharadar review`:
  - single-key actions: like/dislike/save/skip; open link; details/help/quit
  - persists feedback immediately to `feedback_events`
  - now skips already-reviewed items based on `feedback_events` so reruns don’t show the same cards again
- Added `@aharadar/shared` feedback types (`FeedbackAction`, `FeedbackEventDraft`).
- Added `@aharadar/db` repo for `feedback_events`.

### 2) Topics/Collections (user-defined; topic-scoped digests/review)

Reason: A single user can have multiple unrelated interests; a single mixed digest/review queue is noisy. “Topic-agnostic” stays true (no domain logic), but the UX becomes topic-scoped.

- Added ADR `docs/adr/0008-topics-collections.md` defining:
  - topics are user-defined collections of sources
  - pipeline runs + digests are topic-scoped
  - crucially, we must track `(content_item, source)` associations to preserve topic membership across URL dedupe
- DB migration adds:
  - `topics` table + default topic per user (`default`)
  - `sources.topic_id` (one topic per source in MVP)
  - `digests.topic_id` (digests are topic-scoped)
  - `content_item_sources(content_item_id, source_id)` association table
- Pipeline now threads `topicId` through ingest and digest:
  - ingest loads enabled sources by topic
  - ingest upserts `content_item_sources` for each upserted item
  - digest candidate selection is topic-scoped via `content_item_sources → sources(topic_id)`
- CLI now supports topic selection/management:
  - `admin:topics-list`, `admin:topics-add`
  - `admin:sources-add --topic ...`
  - `admin:sources-set-topic --source-id ... --topic ...`
  - `admin:run-now --topic ...`, `admin:digest-now --topic ...`
  - `inbox --topic ...`, `review --topic ...`

### 3) Dev UX improvements around limits

Issue observed: default digest size was 20, so `review` could look “broken” (e.g., only Reddit showing even if signal items were ingested).

- `admin:run-now` now defaults digest size to **“all candidates (capped)”**:
  - it runs ingest first
  - sets digest size to `min(500, max(20, ingest.totals.upserted))`
  - optional override: `--max-digest-items N`

## Current state (what works / what’s broken)

- **Works**:
  - Topic-scoped ingest/digest: `pnpm dev:cli -- admin:run-now --topic <name>`
  - Topic-scoped inbox/review: `pnpm dev:cli -- inbox --topic <name>`, `pnpm dev:cli -- review --topic <name>`
  - Review persists feedback and does not re-show already-reviewed items.
  - Signal runs can be expensive; a sample run showed 27 `signal_search` provider calls and cost estimates recorded.
- **Broken / TODO**:
  - Embeddings stage is still a stub (`packages/pipeline/src/stages/embed.ts`).
  - No semantic search (`cli search` is still a placeholder).
  - No clustering/dedupe/rank stages beyond the digest-stage heuristic + triage.
  - Budgets are not enforced as a ledger yet (only caps/estimates in places).

## How to run / reproduce (exact commands)

- **Services**:
  - `./scripts/dev.sh`
- **Migrations**:
  - `./scripts/migrate.sh`
- **Topics**:
  - `pnpm dev:cli -- admin:topics-add --name "finance"`
  - `pnpm dev:cli -- admin:topics-list`
  - `pnpm dev:cli -- admin:sources-set-topic --source-id <uuid> --topic finance`
- **Run ingest + digest for a topic**:
  - `pnpm dev:cli -- admin:run-now --topic finance`
  - Optional (bigger digest): `pnpm dev:cli -- admin:run-now --topic finance --max-digest-items 200`
- **Review**:
  - `pnpm dev:cli -- review --topic finance`
- **Key env vars** (names only; no secrets):
  - `DATABASE_URL`
  - `REDIS_URL`
  - `MONTHLY_CREDITS`
  - `DEFAULT_TIER`
  - Signals: `GROK_API_KEY` / `SIGNAL_GROK_API_KEY`, `GROK_BASE_URL` / `SIGNAL_GROK_BASE_URL`, `SIGNAL_GROK_MODEL`
  - LLM triage: `OPENAI_API_KEY`, `OPENAI_ENDPOINT` or `OPENAI_BASE_URL`, `OPENAI_TRIAGE_MODEL(_LOW/_NORMAL/_HIGH)`

## Relevant contracts (what we relied on)

- `docs/spec.md` — MVP scope; now explicitly topic-scoped digests + user-defined topics/collections.
- `docs/pipeline.md` — stage order; now notes topic-scoped behavior and `content_item_sources` association.
- `docs/data-model.md` — schema contract; updated for topics + topic-scoped digests + `content_item_sources`.
- `docs/cli.md` — CLI UX + topic selection flags.
- ADR `docs/adr/0008-topics-collections.md` — canonical decision + why `content_item_sources` is required.

## Key files touched (high-signal only)

- Docs:
  - `docs/adr/0008-topics-collections.md` — topics/collections decision + rationale
  - `docs/spec.md`, `docs/pipeline.md`, `docs/data-model.md`, `docs/cli.md` — updated contracts
- DB:
  - `packages/db/migrations/0002_topics.sql` — topics + topic_id columns + `content_item_sources`
  - `packages/db/src/repos/topics.ts` — topics repo
  - `packages/db/src/repos/content_item_sources.ts` — association repo
  - `packages/db/src/repos/sources.ts` — topic_id support + listEnabledByUserAndTopic + updateTopic
  - `packages/db/src/repos/digests.ts` — topic-scoped digests
  - `packages/db/src/repos/feedback_events.ts` — feedback persistence (created earlier in session)
  - `packages/db/src/db.ts` — wires new repos into Db context
- Pipeline:
  - `packages/pipeline/src/stages/ingest.ts` — loads sources by topic; upserts `content_item_sources`
  - `packages/pipeline/src/stages/digest.ts` — candidates are topic-scoped via association table; digests include topic_id
  - `packages/pipeline/src/scheduler/run.ts` — threads `topicId` through
- CLI:
  - `packages/cli/src/topics.ts` — resolve `--topic <id-or-name>` with safe defaults
  - `packages/cli/src/commands/admin.ts` — topic commands + run-now dev digest sizing + sources topic assignment
  - `packages/cli/src/commands/inbox.ts` — topic-scoped inbox
  - `packages/cli/src/commands/review.ts` — interactive review + skip reviewed items

## Commit log (what to look at)

Recent commits since last recap:

- `04a4280 fix(cli): make run-now digest dev-friendly and review skip reviewed items`
- `cca30e5 feat(topics): add user-defined topics and topic-scoped digests/review`
- `fd4d0a1 feat(cli): add interactive review loop and persist feedback events`

## What’s next (ordered) — **Embeddings focus plan**

Goal: implement embeddings end-to-end, then use them for semantic search and as the foundation for clustering + personalization.

### Step 0 — Decide embedding provider + credits mapping (small ADR/update)

- Choose a provider abstraction (keep provider-agnostic per repo invariant):
  - Likely implement OpenAI-compatible embeddings first (same `OPENAI_*` base URL approach), but behind an interface.
- Decide and document:
  - embedding model env vars (similar to `OPENAI_TRIAGE_MODEL_*`)
  - embedding dims must match schema (`vector(1536)` currently)
  - credits estimate: `OPENAI_EMBED_CREDITS_PER_1K_TOKENS` (or similar) and record `provider_calls` with purpose=`embedding`

### Step 1 — DB repos + queries for embeddings

- Add `@aharadar/db` repo for `embeddings`:
  - insert/upsert by `content_item_id`
  - list missing embeddings scoped to `(user_id, topic_id)` using `content_item_sources → sources(topic_id)`
  - skip deleted and duplicates (`deleted_at is null` and `duplicate_of_content_item_id is null`)
- Optional: store `hash_text` on content_items (already exists) and only re-embed when it changes.

### Step 2 — Implement embedding provider in `@aharadar/llm` or a new package

- Add a small provider client:
  - request embeddings endpoint
  - return vector + token usage if available
  - strict validation of vector dims (must be 1536 until schema changes)
- Record `provider_calls` for each embedding call (purpose=`embedding`, tokens, credits estimate).

### Step 3 — Pipeline embed stage (topic-scoped)

- Implement `packages/pipeline/src/stages/embed.ts`:
  - deterministic input text: `title + "\n\n" + body_text` (truncate deterministically)
  - process missing embeddings for new items after ingest
  - enforce a per-run cap (config/env) to avoid runaway costs
  - run per-topic (thread `topicId`)
- Wire embed stage into `runPipelineOnce` after ingest and before digest (or as a separate admin command initially).

### Step 4 — Topic-scoped semantic search in CLI (first user-visible embedding win)

- Implement `cli search --topic <...> "<query>"`
  - embed query text
  - pgvector similarity search over `embeddings.vector`
  - join `content_items` + `content_item_sources → sources(topic_id)` so results are topic-scoped
  - show top N results with link + title + source

### Step 5 — Personalization (use feedback + embeddings)

- Implement topic-scoped preference profile:
  - Either add `topic_id` to `user_preference_profiles` or add a new table `topic_preference_profiles`.
  - Build/update vectors from feedback:
    - likes/saves contribute positively
    - dislikes contribute negatively
- Add to digest ranking:
  - preference similarity feature (cosine between candidate embedding/cluster centroid and topic preference vector)

### Step 6 — Clustering (later but enabled by embeddings)

- Implement `cluster` and `cluster_items` logic per `docs/pipeline.md`:
  - topic-scoped clusters (likely add `topic_id` column to `clusters`)
  - assign items by nearest centroid using pgvector HNSW

## Open questions / decisions needed

- Embeddings provider choice and endpoint/env var naming (keep provider-agnostic).
- Whether preference profiles are stored per topic (recommended) vs global per user.
- Whether to wire embed into `admin:run-now` immediately vs separate `admin:embed-now` command first.
