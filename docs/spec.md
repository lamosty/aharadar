# Personalized “Aha Radar” — Technical & Product Specification (MVP → v1)

> **Document status:** Draft v0.3
> **Language:** English
> **Audience:** Builders/maintainers and future contributors
> **Core idea:** A generic, user-personalized content aggregation + ranking system that surfaces only “high-signal / novel / aha” content from user-chosen sources, with a tight budget dial and a fast feedback loop.

---

## Vision & Goals

### Vision

Build a **generic** personalized content manager that continuously monitors user-defined web sources and produces curated digests of only the most interesting and novel items for that user. The system should drastically reduce time spent reading noise while increasing the likelihood of “aha” moments.

This is **not** limited to markets or tech. Any user can define sources and interests (finance, tech, science, local news, gardening, medicine research, sports analysis, programming, cars, etc.). The mechanism is the same: ingest → normalize → dedupe/cluster → rank with personalization → budget-aware LLM enrichment → deliver digest → learn from feedback.

**Topic-agnostic by design (explicit):**

- The system MUST NOT hardcode any domain assumptions (finance/crypto/etc.).
- Personalization comes from user-chosen sources + embeddings + feedback, not from domain-specific rules.
- Prompts, schemas, ranking features, and UI labels should remain generic.

### Primary goals

1. **High-signal discovery:** Surface content that is novel, meaningful, and relevant to each user.
2. **Personalization:** Improve ranking rapidly via explicit user feedback (like/dislike/swipe).
3. **Budget dial:** Operate reliably under a low monthly spend and scale up when desired.
4. **Source modularity:** Make it easy to add new connectors and replace providers without refactoring core logic.
5. **Operational simplicity:** Same stack locally and in production (Docker Compose), minimal maintenance.
6. **Portfolio-grade repo:** Clean architecture, tests, CI, good README, safe deployment practices.

### Secondary goals

- Provide explanations: _why this item/cluster is shown_ (“Because you liked X and this is similar; also trending across sources”).
- Preserve provenance: allow the user to click original sources easily.
- Provide “catch-up” mode for days/weeks of missed reading.
- Maximize **aha-per-minute**: aggressively discard noise so the user reviews only the “good stuff”.

---

## Non-goals

- Not a trading bot; no broker integrations or automated trading.
- No “investment advice” or guarantee of correctness.
- No “scrape everything from X/Twitter” in MVP. X is treated as a **signal source** using an X/Twitter search provider (e.g., Grok X Search) rather than full-firehose ingestion.
- No custom model fine-tuning in MVP.
- No heavy multimedia understanding (image/chart OCR, video decoding) in MVP.
- No bypassing paywalls or ToS violations.
- Not a “summarize everything on the internet” app. The system prioritizes **hard filtering** first; summarization is applied only after items/clusters pass the relevance/novelty threshold.

---

## Competitors & Learnings (context for product decisions)

> This section captures learnings from reviewing existing tools/projects mentioned during planning. It is informational and does not change requirements unless explicitly referenced elsewhere in this spec.

### Feedly + Leo

- **Learning:** Feedly behaves primarily as a feed/reader experience rather than an “aha ideas discoverer” optimized for novelty.
- **Learning:** Reddit integration in Feedly typically requires connecting a Reddit account. For our product direction, we want **public-source ingestion without requiring users to connect their personal Reddit accounts** in MVP.
- **Implication:** Prefer official read-only/app-based access where possible; avoid user-linked OAuth for public sources in MVP.

### Artifact

- **Learning:** Artifact is no longer available as an active product. This reinforces the need to keep scope lean, focus on a small “core loop” (signal → feedback → better signal), and avoid building an expensive consumer-grade UI before proving value.

### Auto-News / Dots (dots.dotsfy.com)

- **Learning:** Auto-News is technically impressive but complex. The hosted UI felt more like an “article inbox” and is not optimized for simple feedback.
- **Learning:** Too many UI states (stars, inboxes, history, etc.) can lead to complexity and maintenance burden.
- **Implication:** Our app should be much simpler in MVP: a review queue with a tiny set of actions (thumbs up/down, optional save, open source) and minimal navigation. Also, we should avoid drifting into “summarize everything” and instead focus on novelty/aha filtering.

### Other projects

- **Learning:** Many projects are RSS summarizers or single-source summarizers and do not provide:
  - strong personalization via feedback
  - “aha-first” novelty filtering
  - or budget-aware hard filtering with progressive enrichment
- **Implication:** Our differentiator is the **hard-filter + feedback + budget dial** loop, with minimal operational complexity.

---

## Scope

### In-scope (MVP)

- **User-configurable sources** (initial connectors):
  - Reddit (subreddits, optionally users)
  - Hacker News (top/new, optionally comments)
  - RSS feeds (e.g., ZeroHedge website RSS or any blog/news RSS)
  - YouTube (channels → titles/descriptions + transcripts when available)
  - **Signals** via search/trend/alerts providers (initial MVP adapter: X/Twitter search provider) as summarized signals + extracted entities/links
- **Core pipeline**:
  - Normalize all inputs into a unified content schema
  - Deduplicate and cluster similar items across sources
  - Personalization ranking using embeddings and feedback
  - Budget-aware LLM processing using a configurable LLM provider (OpenAI GPT models as default at time of writing)
  - Produce scheduled digests (default 3× daily)
- **User feedback loop**:
  - Like/Dislike/Save/Skip actions
  - Use feedback to update preference profile and improve ranking
- **Delivery interface**:
  - CLI-first (fast development)
  - Optional minimal web UI (digest list + detail + feedback)
- **Observability**:
  - Token/cost accounting per run and per user
  - Logs and metrics to debug ingestion, ranking, and failures

### Out-of-scope (MVP; future)

- Multi-user billing/subscriptions and payments
- Full-featured mobile app (native)
- Real-time streaming ingestion
- Vision parsing for images/charts (optional later)
- Automated “deep web research loops” for every item (expensive; add only with dial-up mode)
- Generic web page ingestion/extraction beyond RSS (planned as v2 `web` connector)

### Account-linking policy (MVP)

- Public sources SHOULD NOT require users to connect their personal accounts (e.g., Reddit account linking) for basic ingestion.
- Per-user account linking/OAuth is deferred to future scope and used only when needed (e.g., private feeds, private saved items, or access-limited endpoints).

---

## Target Environments

### Local development

- **Hardware:** MacBook Pro **M3 Max (late 2023)**, 36 GB RAM (or similar)
- **Goal:** run _the same stack_ as production using Docker Compose
- **Notes:** Apple Silicon (arm64) vs Hetzner server (x86_64) — build multi-arch images or use compatible base images.

### Production

- **Server:** Hetzner **AX52**, Ubuntu LTS
- **Existing services:** may already run other apps/panels (e.g., Enhance Control Panel) — run this app as a **separate** Compose project with isolated ports and volumes.
- **Goal:** minimal maintenance and safe rollbacks (immutable container tags).

---

## Glossary

- **Source:** A feed definition (e.g., subreddit, RSS feed URL, YouTube channel, list of X accounts).
- **Connector:** Module that fetches and normalizes items from a source type.
- **Raw Item:** Source-native representation (e.g., Reddit JSON, RSS entry).
- **Content Item:** Unified normalized unit (post/article/video/tweet-signal).
- **Ingestion Run:** A scheduled execution that fetches new items and processes them.
- **Embedding:** Vector representation of text semantics (used for similarity, dedupe, personalization).
- **Vector Search:** Similarity search in embedding space.
- **Cluster:** A group of similar items representing one “story/topic”.
- **Triage:** Low-cost filtering/scoring step (fast model, minimal context).
- **Enrichment:** LLM-generated summary, entity extraction, “why it matters”.
- **Digest:** Curated output for a time window delivered to the user.
- **Budget dial:** Configurable caps that control cost and depth of processing.

---

## Personas

1. **Single-user builder (MVP primary)**
   - Wants high-signal digests 2–3× daily
   - Provides quick feedback to train personalization
   - Runs locally on MacBook and deploys to Hetzner
2. **Future general user**
   - Chooses sources and interests
   - Wants simple, fast interface and privacy
3. **Admin/operator**
   - Configures sources, schedules, budgets, monitors health and spend

---

## User Journeys

### Journey A — Daily digest

1. System runs at scheduled times (e.g., morning/lunch/evening).
2. User opens CLI/web UI.
3. User sees a ranked list of clusters/items with short summaries.
4. User likes/dislikes quickly (“tinder style” is possible later).
5. Preference profile updates and next digests improve.

### Journey B — Catch-up

1. User selects “Last 7 days highlights”.
2. System clusters and ranks by novelty and user preference.
3. User reviews a smaller set of top clusters rather than thousands of items.

### Journey C — Investigate a theme

1. User enters a semantic query.
2. System retrieves relevant clusters from history.
3. User requests a deep dive on one cluster (optional dial-up mode).

---

## Functional Requirements (FR)

### Connectors & ingestion

**FR-001** The system SHALL implement pluggable connectors with a common interface:

- `fetch(cursor, limits) -> RawItem[]`
- `normalize(raw) -> ContentItemDraft`

**FR-002** The system SHALL support ingesting Reddit posts and optionally top comments.

**FR-003** The system SHALL support ingesting Hacker News stories and optionally comments.

**FR-004** The system SHALL support ingesting RSS feed items.

**FR-004a (future; not MVP)** The system MAY support ingesting public web pages/sites (blogs/news) when RSS is not available:

- Discover new article URLs from configured seed/listing pages (or sitemap) without ToS violations.
- Extract title/body/published_at using deterministic parsing (e.g., Readability/structured metadata).
- Prefer RSS when available; do not bypass paywalls.

**FR-005** The system SHALL support ingesting YouTube channel updates and transcripts when available.

**FR-006** The system SHALL support ingesting **signals** via a search/trend/alerts provider (initial MVP adapter: X/Twitter search provider):

- Store summarized signals and extracted entities/links as Content Items.
- Treat X as a _signal amplifier_ rather than a full data lake in MVP.

**FR-007** The system SHALL store raw payloads (configurable retention) for debugging/provenance.

**FR-008** The system SHALL perform incremental ingestion using cursors (timestamps/IDs) to avoid re-fetching.

### Normalization & storage

**FR-009** The system SHALL normalize all items into a unified schema:

- `title`, `body_text`, `canonical_url`, `source_type`, `external_id`, `published_at`, `author`, `metadata_json`.

**FR-010** The system SHALL canonicalize URLs (strip tracking parameters, normalize host/scheme).

**FR-011** The system SHALL deduplicate items based on:

- canonical URL hash (primary)
- source external ID (when available)
- optional semantic similarity threshold (secondary)

**FR-012** The system SHALL cluster semantically similar items within a configurable time window.

### Embeddings & retrieval

**FR-013** The system SHALL compute embeddings for normalized text and store them.

- MVP choice: Postgres + pgvector.
- Embeddings are used for:
  - dedupe (near-duplicate detection)
  - clustering
  - personalization
  - semantic search

**FR-014** The system SHALL support semantic search across user history.

### Personalization

**FR-015** The system SHALL record explicit feedback actions:

- Like / Dislike / Save / Skip

**FR-016** The system SHALL update a user preference profile based on feedback using embeddings.

**FR-017** The ranking algorithm SHALL combine:

- preference similarity
- novelty vs user history
- source weighting
- recency decay
- cluster-level aggregation

### LLM enrichment (provider-agnostic)

**FR-018** The system SHALL use configurable LLM provider(s) for:

- triage scoring/classification (cheap model)
- deep summarization and “why it matters” (more capable model)
- entity extraction (optional)
- explanation generation (optional)

**FR-019** The system SHALL structure LLM outputs via JSON schema (or strict format) to ensure reliability.

**FR-019a** The triage output SHALL include an explicit **Aha Score** (0–100) and a short reason string. This score is the primary ranking input for what the user sees.

### Budget dial

**FR-020** The system SHALL enforce configurable budgets per user and per period (monthly credits) with optional daily throttling:

- max credits per month (budget pool)
- optional daily throttle credits
- max fetch items per source per run
- max embeddings per run
- max LLM calls per purpose
- max tokens per call
- max X/Twitter search calls per day

**FR-021** The system SHALL implement a “low tier” fallback:

- if budget is reached, skip deep summaries and deliver triage-only digests.

**FR-022** The system SHALL log token usage and estimate cost (in credits) per provider per run.

### Digests & delivery

**FR-023** The system SHALL generate digests on a schedule (default 3× daily, configurable timezone).

**FR-024** The CLI SHALL allow fast review with keyboard actions:

- next/prev item
- like/dislike/save/skip
- open link in browser
- show “why this is shown”

**FR-025** The system MAY expose a minimal HTTP API for web UI:

- view digests
- view items
- submit feedback

---

## Data Model (Postgres + pgvector)

> Single database for MVP. Vector storage uses pgvector to reduce operational complexity.

### Tables (minimum)

- `users`
  - `id`, `email` (nullable in single-user MVP), `created_at`
- `sources`
  - `id`, `user_id`, `type`, `name`, `config_json`, `is_enabled`, `created_at`
- `fetch_runs`
  - `id`, `source_id`, `started_at`, `ended_at`, `status`, `error_json`
- `content_items`
  - `id`, `user_id`, `source_id`, `external_id`, `canonical_url`, `title`, `body_text`,
    `author`, `published_at`, `fetched_at`, `language`, `metadata_json`,
    `hash_url`, `hash_text`, `raw_json`, `deleted_at`
- `embeddings`
  - `content_item_id` (PK), `model`, `dims`, `vector`, `created_at`
- `clusters`
  - `id`, `user_id`, `created_at`, `updated_at`, `centroid_vector`, `top_terms_json`
- `cluster_items`
  - `cluster_id`, `content_item_id`, `similarity`, `added_at`
- `digests`
  - `id`, `user_id`, `window_start`, `window_end`, `created_at`, `mode`
- `digest_items`
  - `digest_id`, `cluster_id` (nullable), `content_item_id` (nullable),
    `rank`, `score`, `triage_json`, `summary_json`, `entities_json`
- `feedback_events`
  - `id`, `user_id`, `content_item_id`, `digest_id`, `action`, `created_at`
- `provider_calls`
  - `id`, `user_id`, `purpose`, `provider`, `model`,
    `input_tokens`, `output_tokens`, `cost_estimate_credits`, `meta_json`,
    `started_at`, `ended_at`, `status`, `error_json`

### Indexing (high level)

- Unique `(source_id, external_id)` when present
- Unique `hash_url` (optional) to dedupe by canonical URL
- Full-text index on `title/body_text` (optional)
- Vector index (HNSW) on `embeddings.vector` (implementation detail)
- Time indexes on `published_at`, `fetched_at`

---

## API / Contracts

### Internal contracts

#### Connector interface

```ts
interface Connector {
  sourceType: "reddit" | "hn" | "rss" | "youtube" | "signal" | string;
  fetch(params: FetchParams): Promise<RawItem[]>;
  normalize(raw: RawItem): Promise<ContentItemDraft>;
}
```

#### Pipeline stages

- `IngestStage`: fetch + normalize + store
- `EmbedStage`: create embeddings + store
- `DedupeStage`: mark duplicates + attach to clusters
- `ClusterStage`: update cluster membership and centroids
- `RankStage`: compute ranking scores
- `LLMStage`: triage + deep summary (budget-aware)
- `DigestStage`: assemble and store digest output

#### LLM router

```ts
type TaskType = "triage" | "deep_summary" | "entity_extract" | "signal_parse";
type BudgetTier = "low" | "normal" | "high";

type ModelRef = { provider: string; model: string };

interface LLMRouter {
  chooseModel(task: TaskType, tier: BudgetTier): ModelRef; // provider+model are implementation details
  call(task: TaskType, ref: ModelRef, input: LLMInput): Promise<LLMOutput>;
}
```

### HTTP API (optional MVP)

- `GET /api/digests?from=&to=`
- `GET /api/digests/:id`
- `GET /api/items/:id`
- `POST /api/feedback`
  - `{ contentItemId, digestId, action }`
- `POST /api/admin/run` (admin)
- `GET/PUT /api/admin/config` (admin)

Auth options:

- MVP: static admin API key (env)
- Future: user sessions + OAuth/email login

---

## UI States (CLI-first; web optional)

### UX principle for MVP

- The MVP UI should be as simple as possible: a single “review queue” where the user can quickly **thumbs up/down** (and optionally save) and move on.
- Avoid additional navigation concepts (inbox/stars/history sections) unless proven necessary.

### CLI states

1. **Home**
   - show latest digests and next scheduled run
2. **Digest list**
   - ranked items (cluster-title + sources)
3. **Item detail**
   - triage summary (with Aha Score + reason)
   - deep summary (if generated)
   - entities/tags
   - open link
   - like/dislike/save/skip
4. **Search**
   - semantic query → top clusters/items
5. **Admin**
   - run now, show budget usage, show errors

### Web UI states (optional)

- Digest list
- Digest detail
- Item detail
- Settings (sources, schedule, budgets)

---

## Permissions

- **User**:
  - view own digests/items
  - submit feedback
  - view history/search
- **Admin**:
  - configure system settings
  - view logs/metrics
  - trigger runs

Future multi-user:

- strict tenant isolation by `user_id`
- admin roles for system maintenance

---

## Validation Rules

- Normalize and validate URLs (canonicalization required).
- Enforce max text length per item; store raw separately if needed.
- Language detection and filtering (configurable).
- JSON schema validation for LLM outputs.
- Budget limits hard-enforced:
  - stop deeper processing when caps are hit
  - always attempt to produce _some_ digest output

---

## Error Handling

- Connector errors:
  - retries with exponential backoff
  - circuit breaker per source
  - store partial results
- Rate limiting:
  - detect 429/503, pause source temporarily
- LLM failures:
  - retry once
  - fallback to a smaller/cheaper model tier
  - or skip deep summary and deliver triage-only
- Idempotency:
  - re-running a window does not create duplicates

---

## Edge Cases

- Duplicate stories across sources (same link posted on Reddit + HN + RSS)
- Link-only posts (need to fetch title/metadata)
- RSS feeds with missing dates or repeated GUIDs
- YouTube transcripts missing/disabled
- Signals vague or without stable identifiers
- Sudden viral spam (e.g., meme floods) → throttles and preference dampening
- Paywalled pages → do not bypass; store metadata and user-visible link

---

## Non-functional Requirements

### Performance

- Typical scheduled run completes within configurable budget (e.g., 5–15 min).
- UI actions should be fast (<500ms typical for remote).

### Security

- Secrets in env, never committed.
- DB and Redis not exposed publicly.
- Validate inbound API requests (if web UI enabled).
- TLS termination (reverse proxy) in production if web UI used.

### Privacy

- Retention policies:
  - raw payload retention configurable
  - embeddings and summaries retention configurable
- For multi-user: tenant isolation, no cross-user leakage.

### Maintainability

- Same runtime locally and production via Docker Compose.
- Clear modular boundaries (connectors, pipeline, storage, LLM router).

---

## Observability

### Logs

- Structured logs with:
  - `run_id`, `user_id`, `source_id`, `stage`, `latency_ms`, `counts`, `error`

### Metrics

- Ingestion:
  - items fetched per source/run
  - dedupe rate
  - cluster count
- LLM:
  - calls per purpose
  - tokens in/out
  - latency
  - cost estimates
- Budgets:
  - % used daily
  - tasks skipped due to budget

### Audit

- config changes recorded (who/when/what)
- feedback events recorded

---

## Migration / Rollout Plan

### Local development (MacBook Pro M3 Max, late 2023)

- Docker Compose runs:
  - Postgres (+ pgvector)
  - Redis
  - API service
  - Worker service
- Local `.env` for secrets
- CLI runs against local API or directly against DB

### Production deployment (Hetzner AX52, Ubuntu LTS)

- Same Docker Compose file
- Systemd service or `docker compose up -d`
- Scheduled runs via:
  - internal scheduler process
  - or system cron/systemd timer invoking a “run now” endpoint/command
- Backups:
  - Postgres backups to disk + offsite storage
- Reverse proxy (optional web UI):
  - Nginx/Caddy in front (separate or included)

### Rollout steps

1. Deploy stack to staging directory on server
2. Run manual ingestion + digest generation
3. Enable scheduler
4. Monitor spend and performance for 1 week
5. Expand sources gradually

---

## Acceptance Criteria (Given/When/Then)

1. **Ingestion works**

- Given configured Reddit + HN + RSS sources
- When a scheduled run executes
- Then new items are stored, normalized, and deduplicated without crashing

2. **Digest produced**

- Given ≥50 items ingested in the window
- When digest generation runs
- Then a digest exists with ranked items and links

3. **Personalization improves**

- Given the user likes 10 items in one theme and dislikes 10 in another
- When next digest is generated
- Then liked-theme items rank higher and disliked-theme items rank lower

4. **Budget enforced**

- Given daily budget limits
- When the system hits a limit
- Then it skips deep summary but still produces a triage digest

5. **Resilience**

- Given one source is rate-limited
- When a run executes
- Then other sources still process and digest indicates missing source

6. **Same stack locally and prod**

- Given Docker Compose used in both environments
- When running the same version/tag
- Then schema + behavior are consistent (no environment-only bugs)

---

## Open Questions (do not guess; propose options)

1. **Exact MVP source list**

- Option A: start small (2 subreddits, HN top, 3 RSS, 2 YT channels, 30 X accounts for signals)
- Option B: start broad but enforce strict per-source caps

2. **Digest schedule defaults**

- Option A: fixed 3× daily (08:00, 13:00, 20:00 in user timezone)
- Option B: templates (weekday/weekend) and user activity based

3. **Budget defaults**

- Exact monthly credits defaults per tier (`low` / `normal` / `high`) (exact scale TBD)
- Allocation of budget to: embeddings vs triage vs deep summaries vs signals

4. **Embedding model**

- Option A: smaller embedding model for cost/speed
- Option B: larger embedding model for best retrieval quality

5. **Cluster strategy**

- Option A: simple threshold-based clustering + periodic centroid updates
- Option B: more advanced clustering (HDBSCAN etc.) (likely overkill for MVP)

6. **HN comment ingestion**

- Option A: only top-level comments
- Option B: thread summarization (higher cost)

7. **Minimal web UI in MVP**

- Option A: CLI-only
- Option B: minimal web UI for easier use on phone browser

8. **X signal fidelity**

- If the X/Twitter search provider does not provide stable identifiers:
  - Option A: store only summarized signals
  - Option B: store any URLs returned and rely on other sources for details

9. **Multi-user future direction**

- Is multi-user a near-term goal or “maybe later”?
- If near-term, design auth/tenancy from start; else keep simple.

---

## Recommended Implementation Stack (Opinionated MVP)

- **Runtime:** Node.js LTS + TypeScript
- **DB:** Postgres + pgvector
- **Queue:** Redis + BullMQ (or Postgres-based queue if reducing services is desired)
- **Deployment:** Docker Compose (same locally and on server)
- **LLM:** configurable provider(s) for triage/summaries (OpenAI as default at time of writing); configurable X/Twitter search provider for signals (e.g., Grok)
- **Dev machine:** MacBook Pro M3 Max (late 2023)
- **Server:** Hetzner AX52 with Ubuntu LTS

---

## Notes on X/Twitter Strategy (MVP)

- Prefer direct sources (RSS/site) for high-volume accounts (e.g., ZeroHedge website) to reduce X processing cost.
- Use an X/Twitter search provider as a _signal detector_ rather than a full ingestion pipeline.
- Keep a provider interface so official X pay-per-use API can be added later without refactoring.

---
