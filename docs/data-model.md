# Aha Radar — Data Model (Postgres + pgvector)

This document defines the **schema contract** for MVP. Implementation may differ in migration layout, but the _behavioral guarantees_ (idempotency, uniqueness, required fields) should match.

## Goals

- Unify all sources into `content_items` (with provenance).
- Support dedupe and clustering (URL + embeddings).
- Support personalization via feedback-derived preference profile.
- Support budget + cost accounting.

## Conventions

- **IDs**: `uuid` with `gen_random_uuid()` (requires `pgcrypto`).
- **Timestamps**: `timestamptz` in UTC.
- **JSON**: `jsonb` for flexible metadata and raw payload storage.
- **Vectors**: `vector(<DIMS>)` via pgvector extension `vector`.

## Embedding dimension (`<DIMS>`) is a decision

pgvector columns are defined with a fixed dimension in this contract.

- **Proposed default**: `<DIMS> = 1536` (common “small” embedding size)
- If you choose a different embedding model later (e.g., 3072), it requires a migration.

## Source config vs cursor state

We explicitly separate:

- `sources.config_json`: user-configured static settings
- `sources.cursor_json`: mutable connector state for incremental ingestion

This keeps “what the user asked for” separate from “where we left off”.

## Reference DDL (contract)

```sql
-- required extensions
create extension if not exists pgcrypto;
create extension if not exists vector;

-- users (single-user MVP: one row; keep user_id for future multi-user)
create table users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- sources: connector definitions + cursor state
create table sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  type text not null,           -- reddit|hn|rss|youtube|signal|...
  name text not null,
  config_json jsonb not null default '{}'::jsonb,
  cursor_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index sources_user_enabled_idx on sources(user_id, is_enabled);

-- topics: user-defined collections (unrestricted naming/semantics)
create table topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  viewing_profile text,                           -- @deprecated: kept for backward compat; decay derived from digest_interval_minutes
  decay_hours integer,                            -- derived from digest_interval_minutes (formula: round(interval / 60))
  last_checked_at timestamptz,                    -- when user marked topic "caught up" (for NEW badges)
  digest_schedule_enabled boolean not null default true,
  digest_interval_minutes integer not null default 1440,  -- 15 to 43200
  digest_mode text not null default 'normal',     -- low | normal | high
  digest_depth integer not null default 50,       -- 0-100 fine-tuning slider
  digest_cursor_end timestamptz,                  -- scheduler cursor: end of last completed window
  custom_settings jsonb not null default '{}'::jsonb,  -- per-topic feature flags (e.g., aggregate_summary_v1: { enabled: bool })
  created_at timestamptz not null default now()
);
create unique index topics_user_name_uniq on topics(user_id, name);
create index topics_user_created_idx on topics(user_id, created_at desc);
create index topics_user_last_checked_idx on topics(user_id, last_checked_at);
create index topics_user_digest_cursor_idx on topics(user_id, digest_cursor_end);

-- fetch_runs: per-source ingestion audit trail
create table fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null, -- ok|partial|error
  cursor_in_json jsonb not null default '{}'::jsonb,
  cursor_out_json jsonb not null default '{}'::jsonb,
  counts_json jsonb not null default '{}'::jsonb, -- fetched/normalized/upserted/etc
  error_json jsonb,
  created_at timestamptz not null default now()
);
create index fetch_runs_source_started_idx on fetch_runs(source_id, started_at desc);

-- content_items: unified normalized content store
create table content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  source_type text not null,       -- duplicated for convenience/debugging
  external_id text,                -- source-native id (nullable when unavailable)
  canonical_url text,              -- after canonicalization (nullable for some signals)
  title text,
  body_text text,
  author text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  language text,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_json jsonb,                  -- raw payload (optional retention)
  hash_url text,                   -- sha256 hex of canonical_url (nullable if no URL)
  hash_text text,                  -- sha256 hex of embedding-input text (optional)
  duplicate_of_content_item_id uuid references content_items(id),
  deleted_at timestamptz
);

-- idempotency & dedupe indexes
create unique index content_items_source_external_id_uniq
  on content_items(source_id, external_id)
  where external_id is not null;

create unique index content_items_hash_url_uniq
  on content_items(hash_url)
  where hash_url is not null;

-- common query indexes
create index content_items_user_published_idx on content_items(user_id, published_at desc);
create index content_items_user_fetched_idx on content_items(user_id, fetched_at desc);
create index content_items_source_type_idx on content_items(source_type);

-- content_item_sources: record every (content_item, source) association.
-- This preserves provenance and topic membership even when content_items are URL-deduped across sources.
create table content_item_sources (
  content_item_id uuid not null references content_items(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (content_item_id, source_id)
);
create index content_item_sources_source_idx on content_item_sources(source_id);

-- embeddings: 1 row per content item (MVP)
create table embeddings (
  content_item_id uuid primary key references content_items(id) on delete cascade,
  model text not null,
  dims int not null,
  vector vector(1536) not null,
  created_at timestamptz not null default now()
);
create index embeddings_vector_hnsw
  on embeddings using hnsw (vector vector_cosine_ops);

-- clusters: story/topic grouping
create table clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  representative_content_item_id uuid references content_items(id),
  centroid_vector vector(1536),
  top_terms_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clusters_user_updated_idx on clusters(user_id, updated_at desc);
create index clusters_centroid_hnsw
  on clusters using hnsw (centroid_vector vector_cosine_ops);

create table cluster_items (
  cluster_id uuid not null references clusters(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  similarity real,
  added_at timestamptz not null default now(),
  primary key (cluster_id, content_item_id)
);
create index cluster_items_content_item_idx on cluster_items(content_item_id);

-- digests: one per window + mode
create table digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  mode text not null, -- low|normal|high|catch_up
  created_at timestamptz not null default now()
);
create unique index digests_user_topic_window_mode_uniq
  on digests(user_id, topic_id, window_start, window_end, mode);
create index digests_user_created_idx on digests(user_id, created_at desc);

-- digest_items: ranked output rows
create table digest_items (
  digest_id uuid not null references digests(id) on delete cascade,
  cluster_id uuid references clusters(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,
  rank int not null,
  aha_score real not null,
  triage_json jsonb,
  summary_json jsonb,
  entities_json jsonb,
  created_at timestamptz not null default now(),
  primary key (digest_id, rank),
  constraint digest_items_exactly_one_ref_chk check (
    (cluster_id is not null and content_item_id is null)
    or (cluster_id is null and content_item_id is not null)
  )
);
create index digest_items_digest_aha_score_idx on digest_items(digest_id, aha_score desc);

-- feedback_events: explicit user feedback loop
create table feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  digest_id uuid references digests(id) on delete set null,
  content_item_id uuid not null references content_items(id) on delete cascade,
  action text not null, -- like|dislike|skip
  created_at timestamptz not null default now()
);
create index feedback_events_user_created_idx on feedback_events(user_id, created_at desc);
create index feedback_events_item_idx on feedback_events(content_item_id);

-- content_item_summaries: manual paste-and-summarize workflow
-- Users paste content for items, auto-generate AI summary (saved immediately).
-- Raw pasted text is never stored; summaries are upserted per user+item.
create table content_item_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  summary_json jsonb not null,
  source text not null default 'manual_paste',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index content_item_summaries_user_item_idx
  on content_item_summaries(user_id, content_item_id);
create index content_item_summaries_user_created_idx
  on content_item_summaries(user_id, created_at desc);

-- provider_calls: accounting + debuggability for metered provider usage (LLM, embeddings, signal search, etc.)
create table provider_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,          -- triage|deep_summary|entity_extract|signal_parse|embedding|signal_search|...
  provider text not null,         -- openai|anthropic|google|xai|...
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_estimate_credits numeric(12,6) not null default 0,
  meta_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null,           -- ok|error
  error_json jsonb
);
create index provider_calls_user_started_idx on provider_calls(user_id, started_at desc);

-- user_preference_profiles (recommended for fast personalization scoring)
create table user_preference_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  positive_count int not null default 0,
  negative_count int not null default 0,
  positive_vector vector(1536),
  negative_vector vector(1536),
  updated_at timestamptz not null default now()
);

-- topic_preference_profiles (recommended; avoids mixing unrelated topics)
create table topic_preference_profiles (
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  positive_count int not null default 0,
  negative_count int not null default 0,
  positive_vector vector(1536),
  negative_vector vector(1536),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- abtest_runs: one row per AB-test experiment
create table abtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null default 'pending', -- pending|running|completed|failed
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index abtest_runs_user_created_idx on abtest_runs(user_id, created_at desc);
create index abtest_runs_status_idx on abtest_runs(status);

-- abtest_variants: LLM configurations to compare (2+ per run)
create table abtest_variants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references abtest_runs(id) on delete cascade,
  name text not null,
  provider text not null,
  model text not null,
  reasoning_effort text, -- low|medium|high (optional)
  max_output_tokens int,
  "order" int not null default 1
);
create index abtest_variants_run_idx on abtest_variants(run_id);

-- abtest_items: content items to triage (with snapshot)
create table abtest_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references abtest_runs(id) on delete cascade,
  candidate_id uuid, -- original digest candidate (nullable if deleted)
  cluster_id uuid references clusters(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,
  representative_content_item_id uuid references content_items(id) on delete set null,
  source_id uuid references sources(id) on delete set null,
  source_type text,
  title text,
  url text,
  author text,
  published_at timestamptz,
  body_text text
);
create index abtest_items_run_idx on abtest_items(run_id);

-- abtest_results: per-item, per-variant triage output
create table abtest_results (
  id uuid primary key default gen_random_uuid(),
  abtest_item_id uuid not null references abtest_items(id) on delete cascade,
  variant_id uuid not null references abtest_variants(id) on delete cascade,
  triage_json jsonb,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  status text not null default 'pending', -- pending|ok|error
  error_json jsonb,
  created_at timestamptz not null default now()
);
create unique index abtest_results_item_variant_uniq on abtest_results(abtest_item_id, variant_id);
create index abtest_results_variant_idx on abtest_results(variant_id);

-- x_account_policies: per-account throttling for x_posts based on feedback
-- Tracks feedback-derived scores and mode overrides for X accounts.
-- Used to gradually reduce fetch frequency for accounts with negative feedback.
create table x_account_policies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  handle text not null, -- lowercase, without @
  mode text not null default 'auto', -- auto|always|mute
  pos_score double precision not null default 0, -- decayed positive feedback weight
  neg_score double precision not null default 0, -- decayed negative feedback weight
  last_feedback_at timestamptz, -- when last feedback was applied
  last_updated_at timestamptz, -- when decay was last applied
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode in ('auto', 'always', 'mute'))
);
create unique index x_account_policies_source_handle_uniq on x_account_policies(source_id, handle);
create index x_account_policies_source_idx on x_account_policies(source_id);

-- aggregate_summaries: multi-item scope summaries (digest, inbox, range, custom)
-- One summary per unique scope per user (upsert on re-run).
-- Stores LLM output + usage metrics for aggregated content summaries.
create table aggregate_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope_type text not null check (scope_type in ('digest', 'inbox', 'range', 'custom')),
  scope_hash text not null, -- deterministic hash of normalized scope
  digest_id uuid null references digests(id) on delete cascade,
  topic_id uuid null references topics(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'complete', 'error', 'skipped')),
  summary_json jsonb, -- output of aggregate_summary_v1 schema
  prompt_id text,
  schema_version text,
  provider text,
  model text,
  input_item_count int,
  input_char_count int,
  input_tokens int,
  output_tokens int,
  cost_estimate_credits numeric(12,6),
  meta_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index aggregate_summaries_user_scope_hash on aggregate_summaries(user_id, scope_hash);
create index aggregate_summaries_digest_id on aggregate_summaries(digest_id);
create index aggregate_summaries_topic_scope on aggregate_summaries(topic_id, scope_type);
```

## Notes & constraints

### URL canonicalization

Canonicalization must:

- normalize scheme/host
- strip known tracking params (utm\_\*, fbclid, gclid, ref, etc.)
- normalize trailing slashes
- keep essential query params when they define unique content (TBD list)

`hash_url` is computed from the canonical URL **after** canonicalization.

### Text limits (budget + storage)

We will enforce max lengths (exact values TBD):

- `title` max chars
- `body_text` max chars stored
- embedding input max tokens/chars (truncate deterministically)

### Retention policies

Raw payloads (`raw_json`) and large enrichment (`summary_json`) should be retention-configurable:

- keep full in dev for debugging
- keep limited duration in prod (TBD)
