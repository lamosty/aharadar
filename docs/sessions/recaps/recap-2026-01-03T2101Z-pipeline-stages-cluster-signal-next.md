# Session recap — 2026-01-03 (pipeline stages + cluster-based digests + signal plan)

## Session header

- **Recap filename**: `docs/sessions/recaps/recap-2026-01-03T2101Z-pipeline-stages-cluster-signal-next.md`
- **Agent/tool**: Cursor
- **Agent model**: GPT-5.2
- **Date/time (local)**: 2026-01-03
- **Session span**: 2026-01-03 → 2026-01-03
- **Repo branch**: `main`
- **Commit range (optional)**: `0be5313` (+ uncommitted recap file)
- **Context**: We finished the missing MVP pipeline stages (dedupe/cluster/rank/enrich) and made digests cluster-first. Then we reviewed how `signal` (Grok X search) items look in the DB and outlined a concrete next step: treat tweet-level results as first-class content items while keeping provider-agnostic ingestion.

## Goal(s) of the session

- **Primary goal**: Implement the missing MVP pipeline stages per `docs/pipeline.md` so the core loop is real (not stubs).
- **Secondary goals**:
  - Make digests **cluster-first** (story-level) while keeping CLI inbox/review working.
  - Inspect existing `signal` items in the DB and decide how to treat X/Twitter content going forward.

## What changed (high level)

### 1) Pipeline stages: dedupe + cluster + rank + enrich are real

- Implemented **near-duplicate marking** (embeddings-based) as `dedupeTopicContentItems()` in `packages/pipeline/src/stages/dedupe.ts`.
  - Topic-scoped via `content_item_sources → sources(topic_id)`.
  - Conservative threshold (defaults to `0.995` cosine).
  - Explicitly **excludes** `source_type='signal'` (because today’s signal rows are bundles, not canonical posts).
- Implemented **clustering** as `clusterTopicContentItems()` in `packages/pipeline/src/stages/cluster.ts`.
  - Creates/attaches to `clusters` + `cluster_items`.
  - Maintains centroid as a running mean (optional, enabled by default).
  - Also currently excludes `source_type='signal'` for the same reason as above.
- Implemented a reusable **rank combiner** as `rankCandidates()` in `packages/pipeline/src/stages/rank.ts`.
- Implemented **deep-summary enrichment**:
  - Added `packages/llm/src/deep_summary.ts` implementing `deep_summary_v1` strict JSON parsing/validation.
  - Added `packages/pipeline/src/stages/llm_enrich.ts` (`enrichTopCandidates()`), called from the digest stage.
  - Deep summary is **disabled by default** unless `OPENAI_DEEP_SUMMARY_MAX_CALLS_PER_RUN > 0` and tier is not `low`.

### 2) Digests are cluster-first (with item fallback)

- Updated `packages/pipeline/src/stages/digest.ts` so candidate selection prefers **cluster candidates** (clusters with ≥1 in-window member) and falls back to unclustered items.
- Digests now persist `digest_items` rows referencing **`cluster_id`** when possible (otherwise `content_item_id`).

### 3) DB + CLI updates to support cluster-based digests

- Updated `packages/db/src/repos/digest_items.ts` so `replaceForDigest()` can insert:
  - `cluster_id` OR `content_item_id` (exactly one), plus
  - `triage_json`, `summary_json`, `entities_json`.
- Updated CLI queries so cluster digest rows display correctly:
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`
  - Both now resolve a “representative” content item for a cluster based on topic membership and the digest window.
- Updated `packages/cli/src/commands/admin.ts` so:
  - `admin:run-now` runs dedupe+cluster in addition to ingest+embed+digest and prints summaries.
  - `admin:digest-now` also runs dedupe+cluster before persisting a digest.

### 4) Signal strategy investigation (no code changes yet)

- Ran `pnpm dev:cli -- admin:signal-debug --limit 20 --verbose` to inspect stored signal bundles.
- Observed mixed quality: some meaningful excerpts, but also very low-information results (emoji-only, “True”, “LOL”), plus occasional unparseable/no-result bundles.
- Confirmed current contract: signal connector stores **one bundle per (query, day)** (see `docs/connectors.md` + ADR `docs/adr/0003-x-strategy-grok-signal.md`).

## Current state (what works / what’s broken)

- **Works**:
  - Pipeline now runs: ingest → embed → dedupe → cluster → digest (and optional deep summary).
  - `digest_items` can reference clusters; CLI inbox/review can display them.
  - Deep summary can be enabled (strict JSON) and is provider-agnostic via the router task `"deep_summary"`.
- **Broken / TODO**:
  - **Budgets enforcement** is still “best effort” (we log `provider_calls`, but don’t hard-stop paid calls by remaining credits yet).
  - `signal` items are still stored as **bundles** (not tweet-level canonical items), so clustering/dedupe excludes them today.
  - Worker/API/scheduler packages are still mostly stubs; this session focused on the pipeline core and CLI.

## How to run / reproduce (exact commands)

- **Services**:
  - `./scripts/dev.sh`
- **Migrations**:
  - `./scripts/migrate.sh`
- **Run ingest → embed → dedupe → cluster → digest**:
  - `pnpm dev:cli -- admin:run-now --topic <id-or-name>`
- **View latest digest**:
  - `pnpm dev:cli -- inbox --topic <id-or-name>`
- **Review loop**:
  - `pnpm dev:cli -- review --topic <id-or-name>`
- **Inspect signal bundles already stored**:
  - `pnpm dev:cli -- admin:signal-debug --limit 20 --verbose`

## Key env vars (names only; no secrets)

- Core:
  - `DATABASE_URL`, `REDIS_URL`, `MONTHLY_CREDITS`, `DEFAULT_TIER`
- LLM triage:
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL` or `OPENAI_ENDPOINT`
  - `OPENAI_TRIAGE_MODEL(_LOW/_NORMAL/_HIGH)`
- Embeddings:
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL` or `OPENAI_EMBED_ENDPOINT`
  - `OPENAI_EMBED_MODEL(_LOW/_NORMAL/_HIGH)`
- Deep summary (newly used by code; optional):
  - `OPENAI_DEEP_SUMMARY_MODEL(_LOW/_NORMAL/_HIGH)` (or fallback `OPENAI_MODEL`)
  - `OPENAI_DEEP_SUMMARY_MAX_CALLS_PER_RUN` (set > 0 to enable)
  - Optional: `OPENAI_DEEP_SUMMARY_MAX_OUTPUT_TOKENS`, `OPENAI_DEEP_SUMMARY_MAX_INPUT_CHARS`, `OPENAI_DEEP_SUMMARY_REASONING_EFFORT`
- Signals:
  - `SIGNAL_GROK_API_KEY` / `GROK_API_KEY`
  - `SIGNAL_GROK_BASE_URL` / `GROK_BASE_URL` or `SIGNAL_GROK_ENDPOINT`
  - `SIGNAL_GROK_MODEL`

## Relevant contracts (what we relied on)

- `docs/pipeline.md` — stage order, cluster-first digests, and where signals fit conceptually.
- `docs/data-model.md` — `clusters`, `cluster_items`, `digest_items` constraints.
- `docs/connectors.md` — current `signal` contract: **bundle-per-query-per-day**, canonical_url null.
- `docs/llm.md` — strict JSON schemas (triage_v1, deep_summary_v1).
- ADR `docs/adr/0003-x-strategy-grok-signal.md` — “signal amplifier” approach and the future “x_posts” canonical connector path.

## Key files touched (high-signal only)

- Pipeline:
  - `packages/pipeline/src/stages/dedupe.ts` — near-duplicate marking (topic-scoped).
  - `packages/pipeline/src/stages/cluster.ts` — clustering + centroid updates.
  - `packages/pipeline/src/stages/rank.ts` — extracted ranking combiner.
  - `packages/pipeline/src/stages/llm_enrich.ts` — deep summary enrichment (optional).
  - `packages/pipeline/src/stages/digest.ts` — cluster-first candidates + persist cluster_id + summary_json.
  - `packages/pipeline/src/scheduler/run.ts` — runs dedupe+cluster between embed and digest.
- DB:
  - `packages/db/src/repos/digest_items.ts` — supports inserting cluster refs + summary_json/entities_json.
- LLM:
  - `packages/llm/src/deep_summary.ts` — strict deep_summary_v1 helper.
  - `packages/llm/src/index.ts` — exports deep summary helper.
- CLI:
  - `packages/cli/src/commands/admin.ts` — run-now/digest-now call dedupe+cluster; prints summaries.
  - `packages/cli/src/commands/inbox.ts` — cluster digest rows render via representative item resolution.
  - `packages/cli/src/commands/review.ts` — cluster digest rows resolve a feedback item id correctly.

## Commit log (what to look at)

- Recent commits since last recap:
  - `0be5313 feat(pipeline): finish MVP stages (dedupe/cluster/rank/enrich)`
- Pending (not committed yet):
  - `docs(sessions): recap pipeline stages + cluster-based digests + signal plan` (this file)

## What’s next (ordered) — concrete handoff for a new agent

### 1) Make X/Twitter results first-class items (while still using Grok as the access method)

Goal: keep the provider-agnostic **signal ingestion** path, but represent each returned post as a first-class `content_item` so it can be the “whole idea”.

Concrete steps:

1. Update docs contract first:
   - Edit `docs/connectors.md` (`Signals` section) to define:
     - `signal_bundle_v1` (debug/audit) — **optional**, not shown in digests
     - `signal_post_v1` (canonical-ish) — one item per returned post/result, **shown** in digests/review
2. Implement connector output changes:
   - `packages/connectors/src/signal/fetch.ts`:
     - after each provider call, parse assistant results and emit rawItems **per result** (each with `url`, `text`, `date`, `query`, `vendor`, `provider`, `day_bucket`).
     - optionally also emit one bundle raw item for debugging.
   - `packages/connectors/src/signal/normalize.ts`:
     - for `signal_post_v1`:
       - set `canonicalUrl` to the **post URL** (x.com/.../status/...) when available
       - `externalId`: stable; prefer parsing the status id from the URL; fallback to `sha256(url|day_bucket|query)`
       - title/body_text should preserve the post excerpt (no paraphrasing); store query + extracted_urls in metadata.
     - for `signal_bundle_v1` (if kept):
       - keep canonicalUrl null; store full `signal_results[]` for debugging only.
3. Exclude bundles from digests:
   - Update `packages/pipeline/src/stages/digest.ts` candidate selection to ignore `signal_bundle_v1` rows (e.g., filter by `metadata_json->>'kind'`).
4. Allow signal posts into clustering/dedupe (optional, but likely desired):
   - Update `packages/pipeline/src/stages/cluster.ts` and `dedupe.ts` to:
     - include `signal_post_v1` items (they’re canonical-ish now),
     - exclude only bundles.
5. Update CLI debug tooling:
   - Adapt `packages/cli/src/commands/admin.ts` `admin:signal-debug` to:
     - show bundles (debug) OR posts (user-facing) explicitly, or split into two commands.
6. Backfill without paying Grok again:
   - Add a CLI admin command (new) to “explode” existing stored bundles (`metadata_json.signal_results`) into `signal_post_v1` content items.
   - After backfill, optionally soft-delete bundle items or just exclude them from digests.

### 2) If/when official X API becomes usable

- Add a new canonical connector (per ADR 0003 “Future path”):
  - `type = "x_posts"` (canonical)
  - keep `type = "signal"` for search/trend/alerts use-cases
- Because we’ll already be treating “posts” as first-class content items, swapping Grok → official API should be mostly a connector implementation change, not a pipeline refactor.

### 3) Follow-up polish (optional)

- Improve signal quality filters:
  - drop emoji-only / ultra-short results before inserting items (so they don’t enter ranking at all)
  - or penalize them via triage/heuristics
- Add “evidence from X” rendering for clusters (show top 1–3 corroborating posts) rather than showing posts as standalone items.

## Open questions / decisions needed

- Do we keep storing `signal_bundle_v1` rows in `content_items` at all, or move them to `raw_json`/audit-only storage?
- For `signal_post_v1`, should `canonical_url` be the X status URL (recommended), or the extracted external URL when present?
- Should dedupe run on signal posts at all (risk: collapsing distinct-but-similar tweets)?


