# Aha Radar — Pipeline Spec (MVP)

This document defines **stage order**, **inputs/outputs**, **idempotency**, and **budget enforcement** for the MVP pipeline.

## Definitions

- **Window**: `[window_start, window_end)` time range the digest covers.
- **Candidate**: a cluster (preferred) or a single content item evaluated for inclusion in a digest.
- **Budget pool**: numeric cap (credits) that limits spend over time (default: per month, with optional daily throttle).
- **Budget tier**: `low | normal | high` is a policy preset (or derived state) that controls depth of processing.
- **Aha Score**: 0–100 output from triage LLM; primary ranking input.

## Stage order (MVP)

The spec lists stages abstractly; for implementation, the order below is the recommended contract:

1. **Ingest** (per source): fetch → normalize → canonicalize → upsert items → update cursor
2. **Embed**: compute embeddings for new/changed items
3. **Dedupe**: mark hard duplicates (URL/external_id) and optional near-duplicates (semantic)
4. **Cluster**: assign items to clusters / create clusters; update centroids
5. **Candidate selection**: pick clusters/items eligible for the window
6. **Triage (LLM)**: compute `aha_score` + short reason (budget-aware)
7. **Rank**: compute final score combining triage + personalization + novelty + recency + source weighting
8. **Deep enrich (LLM)**: deep summary (+ optional entities) for top-ranked candidates
9. **Persist digest**: write `digests` + `digest_items`

## Stage contracts

### 1) Ingest (per source)

**Inputs**

- enabled `sources` rows for `user_id`
- each source’s `config_json` and `cursor_json`
- per-run limits from budgets

**Outputs**

- new/updated `content_items` (idempotent upserts)
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
  - later: show “missing source” indicators in admin output (optional)

### 2) Embed

**Inputs**

- `content_items` missing an `embeddings` row (and not deleted/duplicate)
- embedding budget caps

**Outputs**

- new `embeddings` rows

**Notes**

- Embedding input text is deterministic: `title + "\n\n" + body_text`, truncated to max length.
- Store embedding `model` and `dims` for audit.

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
  - select content_items in the window not marked duplicate

**Signals vs canonical content (important)**

- Canonical connectors (`reddit|hn|rss|youtube|...` and future `web`) produce items that are the thing the user reads/watches.
- The `signal` connector produces **derived** items (search/trend/alerts) which often work best as **amplifiers**:
  - extract URLs/entities/topics
  - boost ranking of corroborated clusters
  - optionally display as triage-only items when they are high-aha but not yet corroborated

Optional (Proposed, later):

- If a signal item contains high-confidence external URLs that we haven’t ingested yet, enqueue a follow-up `web` ingestion for those URLs (budget-capped).

### 6) Triage (LLM)

**Goal**
Produce `aha_score` (0–100) and a short reason string per candidate.

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

Ranking produces `digest_items.score` and `rank`.

**Feature set (MVP)**

- **Aha**: `aha_score / 100` (from triage LLM)
- **Preference similarity**: cosine(candidate_vector, user_profile_vector)
- **Novelty**: 1 − max cosine(candidate_vector, recent_history_vectors)
- **Recency**: exponential decay based on newest item time in candidate
- **Source weight**: per-source/type weight (configurable)
- **Signal corroboration** (Proposed): boost when a candidate is referenced by recent signal items (URLs/entities overlap)

**Proposed scoring formula (tunable)**

Let each component be normalized to `[0,1]`:

```
final_score =
  w_aha     * aha +
  w_pref    * pref +
  w_novelty * novelty +
  w_recency * recency +
  w_source  * source_weight
```

Default weights are **TBD**; the only strong constraint is:

- `w_aha` should be largest, because Aha Score is the primary user-visible ranking input (FR‑019a).

### 8) Deep enrich (LLM)

**Goal**
Generate deeper summaries only for the most valuable candidates.

**Selection rule (Proposed)**

- Deep summarize top N by `final_score`, where N is budget-capped.
- Optional: only deep summarize if `aha_score ≥ AHA_ENRICH_THRESHOLD` (TBD).

**Storage**

- `digest_items.summary_json` for deep summary
- `digest_items.entities_json` for entity extraction (optional)

**Low-tier behavior**

- In `low`, skip deep summary entirely (triage-only digest is still valid).

### 9) Persist digest

Create:

- `digests` row (unique by `(user_id, window_start, window_end, mode)`)
- `digest_items` rows with:
  - reference to `cluster_id` (preferred) or `content_item_id`
  - `rank` starting at 1
  - `score` and JSON outputs

## Feedback loop integration

Feedback events update personalization inputs:

- store all actions in `feedback_events`
- update `user_preference_profiles` incrementally:
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
