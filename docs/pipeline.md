# Aha Radar — Pipeline Spec (MVP)

This document defines **stage order**, **inputs/outputs**, **idempotency**, and **budget enforcement** for the MVP pipeline.

## Definitions

- **Window**: `[window_start, window_end)` time range the digest covers.
- **Candidate**: a cluster (preferred) or a single content item evaluated for inclusion in a digest.
- **Budget pool**: numeric cap (credits) that limits spend over time (default: per month, with optional daily throttle).
- **Budget tier**: `low | normal | high` is a policy preset (or derived state) that controls depth of processing.
- **AI Score**: 0–100 raw output from triage LLM; stored in `triage_json`.
- **Aha Score**: final personalized ranking score combining AI Score with other factors; stored in `digest_items.aha_score`.
- **Topic**: a user-defined collection of sources. Pipeline runs and digests are topic-scoped (see ADR 0008).

## Stage order (MVP)

The spec lists stages abstractly; for implementation, the order below is the recommended contract:

1. **Ingest** (per source): fetch → normalize → canonicalize → upsert items → update cursor
2. **Embed**: compute embeddings for new/changed items
3. **Dedupe**: mark hard duplicates (URL/external_id) and optional near-duplicates (semantic)
4. **Cluster**: assign items to clusters / create clusters; update centroids
5. **Candidate selection**: pick clusters/items eligible for the window
6. **Triage (LLM)**: compute `ai_score` + short reason (budget-aware)
7. **Rank**: compute final score combining triage + personalization + novelty + recency + source weighting
8. **Deep enrich (LLM)**: deep summary (+ optional entities) for top-ranked candidates
9. **Persist digest**: write `digests` + `digest_items`
10. **Aggregate summary (async job, optional)**: generate multi-item scope summaries after digest creation (handled in Task 142)

## Stage contracts

### 1) Ingest (per source)

**Inputs**

- enabled `sources` rows for `user_id` within the selected `topic_id`
- each source’s `config_json` and `cursor_json`
- per-run limits from budgets

**Outputs**

- new/updated `content_items` (idempotent upserts)
- `content_item_sources` rows linking the upserted `content_item_id` to the ingesting `source_id`
- `fetch_runs` row per source
- updated `sources.cursor_json` (only after successful fetch)

**Idempotency rules**

- Upsert uniqueness:
  - `(source_id, external_id)` when `external_id` exists
  - else by `hash_url` when `canonical_url` exists

**Failure policy**

- Source failures must not abort the entire run:
  - mark `fetch_runs.status = error`
  - continue remaining sources
  - later: show "missing source" indicators in admin output (optional)

**Cadence gating (ADR 0009)**

Before calling `connector.fetch()` for a source, ingest checks whether the source is "due" based on its configured cadence:

- Parse `cadence` from `source.config_json` (optional field).
- If `cadence` is missing: the source is always due (fetch whenever ingest runs).
- If `cadence` is present (e.g., `{ "mode": "interval", "every_minutes": 480 }`):
  - Let `now` = the pipeline run's `windowEnd` (ISO timestamp).
  - Let `last_fetch_at` = `source.cursor_json.last_fetch_at` (ISO timestamp, may be missing).
  - The source is due if `last_fetch_at` is missing OR `now - last_fetch_at >= every_minutes`.

When a source is **not due**:

- Do not call `connector.fetch()`.
- Do not start a `fetch_runs` row.
- Return a per-source result with `status="skipped"` and a clear reason (e.g., `"not_due"`).

When a source is due and fetch succeeds:

- Merge `last_fetch_at: windowEnd` into the cursor persisted via `db.sources.updateCursor()`.

This mechanism allows different source types to have different natural frequencies (e.g., `x_posts` daily, RSS 3×/day) while running the pipeline on a single schedule.

### 2) Embed

**Inputs**

- `content_items` missing an `embeddings` row (and not deleted/duplicate)
- embedding budget caps

**Outputs**

- new `embeddings` rows

**Notes**

- Embedding input text is deterministic: `title + "\n\n" + body_text`, truncated to max length.
- Store embedding `model` and `dims` for audit.
- **Embedding retention (new):** when enabled, prune embeddings older than a per-topic window
  (default 90 days, configurable 30–120) after each pipeline run.
  - Retention is topic-scoped and **never** deletes items with feedback or bookmarks (unless disabled).
  - Effective retention is clamped to at least the novelty lookback window.
  - Embeddings for items shared across multiple topics are preserved (safety-first).
  - Optional hard cap by item count can prune the oldest embeddings beyond a per-topic limit.
  - Optional hard cap by **estimated tokens** can prune older embeddings once the token budget is exceeded
    (token estimates are only recorded for new embeddings going forward).

### 3) Dedupe

**Hard dedupe**

- By unique constraints:
  - `hash_url`
  - `(source_id, external_id)`

**Soft dedupe (optional MVP)**

- For a new item, find nearest neighbors by embedding; if cosine similarity ≥ threshold (TBD, e.g. 0.98),
  mark `duplicate_of_content_item_id`.

**Outputs**

- `content_items.duplicate_of_content_item_id` set for duplicates

### 4) Cluster

**Goal**
Group semantically similar items into a “story/topic” cluster.

**Candidate search**

- Use pgvector similarity search on `clusters.centroid_vector` for the user.
- Restrict to clusters updated recently (TBD window, e.g. last 7 days) for performance and relevance.

**Assignment**

- If best similarity ≥ `CLUSTER_SIM_THRESHOLD` (TBD, e.g. 0.86 cosine), attach item to that cluster.
- Else create a new cluster with:
  - `representative_content_item_id = item.id`
  - `centroid_vector = item.embedding`

**Centroid update (MVP)**

- Maintain centroid as an incremental mean of member vectors (implementation detail).

### 5) Candidate selection

**Goal**
Pick what we will triage/rank for the digest window.

**MVP selection rule (Proposed)**

- Prefer cluster-based digests:
  - select clusters that have ≥1 member item with `published_at` (or `fetched_at`) within the window
- If clustering is disabled or fails, fall back to item-based candidates:
  - select content_items in the window not marked duplicate **scoped to the topic** via `content_item_sources → sources(topic_id)`

**Canonical vs signal content (important)**

- Canonical connectors (`reddit|hn|rss|youtube|x_posts|...` and future `web`) produce items that are the thing the user reads/watches.
  - `x_posts` items are canonical and participate fully in embedding, clustering, dedupe, ranking, and digests (see ADR 0010).
- The `signal` connector is a **derived/amplifier** connector (see `docs/connectors.md`):
  - It produces only `signal_bundle_v1` items for debugging, auditing, and future corroboration.
  - Signal bundles are **excluded** from candidate selection, clustering, dedupe, and digests.
  - Signal bundles work as **amplifiers**: extract URLs/entities/topics and boost ranking of corroborated clusters (future).

Optional (Proposed, later):

- If a signal bundle contains high-confidence external URLs that we haven't ingested yet, enqueue a follow-up `web` ingestion for those URLs (budget-capped).

### 6) Triage (LLM)

**Goal**
Produce `ai_score` (0–100) and a short reason string per candidate.

**Input construction**

- For clusters:
  - representative item title/body
  - top N member titles + source provenance
  - optional: user preference “profile summary” (top likes/dislikes themes)
- For single items:
  - title/body + provenance

**Output storage**

- store triage output JSON into `digest_items.triage_json` for that candidate.
- include schema/prompt version fields (see `docs/llm.md`).

**Budget policy**

- If triage budget is limited:
  - triage only the top K candidates by cheap heuristic (recency + source + simple keyword match)
  - assign default/heuristic aha scores to the rest (or omit them entirely)

**Credits exhaustion behavior (MVP)**

- When remaining credits are low, emit warnings (CLI/API) and automatically reduce tier to `low` unless configured to stop.
- When credits are exhausted, skip paid provider calls (LLM + signal search) but still attempt to produce a digest from already-ingested canonical sources using heuristic scoring.

### 7) Rank

Ranking produces `digest_items.aha_score` and `rank`.

**Feature set (MVP)**

- **AI**: `ai_score / 100` (from triage LLM)
- **Preference similarity**: cosine(candidate_vector, user_profile_vector)
- **Novelty**: 1 − max cosine(candidate_vector, recent_history_vectors)
- **Recency**: exponential decay based on newest item time in candidate
- **Source weight**: per-source/type weight (configurable)
- **Signal corroboration** (Proposed): boost when a candidate is referenced by recent signal items (URLs/entities overlap)

**Proposed scoring formula (tunable)**

Let each component be normalized to `[0,1]`:

```
aha_score =
  w_ai      * ai +
  w_pref    * pref +
  w_novelty * novelty +
  w_recency * recency +
  w_source  * source_weight
```

Default weights are **TBD**; the only strong constraint is:

- `w_ai` should be largest, because AI Score is the primary LLM-based ranking input (FR‑019a).

**Actual scoring formula (current implementation)**

The actual scoring formula in `rank.ts` is:

```
baseScore = w_aha * aha01 + w_heuristic * heuristicScore + w_pref * pref
preWeightScore = baseScore + w_signal * signal01 + w_novelty * novelty01
finalScore = preWeightScore * effectiveWeight * userPrefWeight * decayMultiplier
```

Where:
- `aha01 = ai_score / 100` (0-1 normalized LLM score)
- `heuristicScore = w_recency * recency01 + w_engagement * engagement01` (computed in digest.ts)
- `pref = positiveSim - negativeSim` (user preference similarity, -1 to 1)
- `effectiveWeight` = source type weight × per-source weight (clamped 0.1-3.0)
- `userPrefWeight` = source preference × author preference (from feedback history, clamped 0.5-2.0)
- `decayMultiplier = exp(-ageHours / decayHours)` (exponential decay for freshness)

Default weights: `w_aha=0.8`, `w_heuristic=0.15`, `w_pref=0.15`, `w_novelty=0.05`, `w_signal=0` (disabled).
Heuristic sub-weights: `w_recency=0.6`, `w_engagement=0.4`.

**Score debug feature (`system_features.score_debug_v1`)**

For transparency and debugging, the ranking stage always persists a `score_debug_v1` object inside `triage_json.system_features`. This captures all intermediate values:

```typescript
score_debug_v1: {
  weights: { w_aha, w_heuristic, w_pref, w_novelty, w_signal },
  inputs: {
    ai_score,         // 0-100 raw LLM score
    aha01,            // ai_score / 100
    heuristic_score,  // 0-1 combined recency + engagement
    recency01,        // 0-1 item freshness within window
    engagement01,     // 0-1 normalized engagement (upvotes, comments)
    preference_score, // -1 to 1 (positive_sim - negative_sim)
    novelty01,        // 0-1 (1 = most novel)
    signal01,         // 0 or 1 (signal corroboration match)
  },
  heuristic_weights: { w_recency, w_engagement },
  components: {
    ai: w_aha * aha01,
    heuristic: w_heuristic * heuristic_score,
    preference: w_pref * preference_score,
    novelty: w_novelty * novelty01,
    signal: w_signal * signal01,
  },
  base_score,        // sum of weighted components
  pre_weight_score,  // base_score + signal + novelty
  multipliers: {
    source_weight,           // effective source weight
    user_preference_weight,  // feedback-derived weight
    decay_multiplier,        // recency decay factor
  },
  final_score,       // pre_weight_score * multipliers
}
```

The UI can display this breakdown in a tooltip when the experimental `score_debug` feature is enabled (requires `NEXT_PUBLIC_SCORE_DEBUG_ENABLED=true` env var).

### 8) Deep enrich (LLM)

**Goal**
Generate deeper summaries only for the most valuable candidates.

**Selection rule (Proposed)**

- Deep summarize top N by `aha_score`, where N is budget-capped.
- Optional: only deep summarize if `ai_score ≥ AI_ENRICH_THRESHOLD` (TBD).

**Storage**

- `digest_items.summary_json` for deep summary
- `digest_items.entities_json` for entity extraction (optional)

**Low-tier behavior**

- In `low`, skip deep summary entirely (triage-only digest is still valid).

**Budget dial behavior**

- Deep summary call caps are derived from the digest plan and **scaled down** when credits are approaching/critical.
- Scoring modes can apply an **LLM usage scale** to increase/decrease triage + summary coverage per topic.

### 9) Persist digest

Create:

- `digests` row (unique by `(user_id, window_start, window_end, mode)`)
- `digest_items` rows with:
  - reference to `cluster_id` (preferred) or `content_item_id`
  - `rank` starting at 1
  - `aha_score` and JSON outputs
- `digests.usage_estimate` (pre-run estimate of LLM tokens/credits)
- `digests.usage_actual` (post-run aggregation from `provider_calls`)

### Theme grouping (UI helper)

After triage, we **cluster triage theme strings** for UI grouping. This is a lightweight, topic‑agnostic step that does **not** affect ranking. It is controlled per topic via `topics.custom_settings.theme_tuning_v1`:

- `enabled`: toggle theme grouping computation
- `useClusterContext`: include a few cluster member titles in triage input to produce more specific theme labels (slightly higher token usage)
- `maxItemsPerTheme`: UI-only cap that splits oversized themes into multiple groups (0 = off)
- `subthemesEnabled`: UI-only nested grouping within a theme using lightweight keyword heuristics
- `refineLabels`: UI-only label cleanup/enrichment (no extra LLM usage)
- `minLabelWords`: minimum word count for clustered labels (fallback to raw triage theme if too short)
- `maxDominancePct`: if a single label dominates above this share, fall back to raw themes to avoid giant buckets
- `similarityThreshold`: cosine similarity threshold for grouping
- `lookbackDays`: how far back to reuse theme labels for continuity
  
Cluster labels are chosen to favor **more specific** topic strings (more words/length) within a cluster to avoid overly broad group names.

## Feedback loop integration

Feedback events update personalization inputs:

- store all actions in `feedback_events`
- update preference profiles incrementally:
  - prefer topic-scoped `topic_preference_profiles` to avoid mixing unrelated topics
  - `like/save` increases positive vector contribution
  - `dislike` increases negative vector contribution
  - `skip` is stored but typically lower-weight or ignored (TBD)

## Observability requirements (MVP)

Per run:

- counts per stage (fetched/upserted/embedded/clustered/triaged/enriched)
- budget usage summary:
  - remaining budget pool (credits)
  - tier used (`low|normal|high`)
  - calls + tokens per purpose

Per LLM call:

- record a row in `provider_calls` with tokens and cost estimate (credits) (FR‑022).
