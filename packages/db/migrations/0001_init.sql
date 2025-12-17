-- Aha Radar MVP schema (initial).
-- Mirrors the contract described in docs/data-model.md.

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,           -- reddit|hn|rss|youtube|signal|...
  name text not null,
  config_json jsonb not null default '{}'::jsonb,
  cursor_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sources_user_enabled_idx on sources(user_id, is_enabled);

create table if not exists fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null, -- ok|partial|error
  cursor_in_json jsonb not null default '{}'::jsonb,
  cursor_out_json jsonb not null default '{}'::jsonb,
  counts_json jsonb not null default '{}'::jsonb,
  error_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fetch_runs_source_started_idx on fetch_runs(source_id, started_at desc);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  source_type text not null,
  external_id text,
  canonical_url text,
  title text,
  body_text text,
  author text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  language text,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_json jsonb,
  hash_url text,
  hash_text text,
  duplicate_of_content_item_id uuid references content_items(id),
  deleted_at timestamptz
);

create unique index if not exists content_items_source_external_id_uniq
  on content_items(source_id, external_id)
  where external_id is not null;

create unique index if not exists content_items_hash_url_uniq
  on content_items(hash_url)
  where hash_url is not null;

create index if not exists content_items_user_published_idx on content_items(user_id, published_at desc);
create index if not exists content_items_user_fetched_idx on content_items(user_id, fetched_at desc);
create index if not exists content_items_source_type_idx on content_items(source_type);

create table if not exists embeddings (
  content_item_id uuid primary key references content_items(id) on delete cascade,
  model text not null,
  dims int not null,
  vector vector(1536) not null,
  created_at timestamptz not null default now()
);
create index if not exists embeddings_vector_hnsw
  on embeddings using hnsw (vector vector_cosine_ops);

create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  representative_content_item_id uuid references content_items(id),
  centroid_vector vector(1536),
  top_terms_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clusters_user_updated_idx on clusters(user_id, updated_at desc);
create index if not exists clusters_centroid_hnsw
  on clusters using hnsw (centroid_vector vector_cosine_ops);

create table if not exists cluster_items (
  cluster_id uuid not null references clusters(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  similarity real,
  added_at timestamptz not null default now(),
  primary key (cluster_id, content_item_id)
);
create index if not exists cluster_items_content_item_idx on cluster_items(content_item_id);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  mode text not null, -- low|normal|high|catch_up
  created_at timestamptz not null default now()
);
create unique index if not exists digests_user_window_mode_uniq
  on digests(user_id, window_start, window_end, mode);
create index if not exists digests_user_created_idx on digests(user_id, created_at desc);

create table if not exists digest_items (
  digest_id uuid not null references digests(id) on delete cascade,
  cluster_id uuid references clusters(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,
  rank int not null,
  score real not null,
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
create index if not exists digest_items_digest_score_idx on digest_items(digest_id, score desc);

create table if not exists feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  digest_id uuid references digests(id) on delete set null,
  content_item_id uuid not null references content_items(id) on delete cascade,
  action text not null, -- like|dislike|save|skip
  created_at timestamptz not null default now()
);
create index if not exists feedback_events_user_created_idx on feedback_events(user_id, created_at desc);
create index if not exists feedback_events_item_idx on feedback_events(content_item_id);

create table if not exists provider_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  provider text not null,
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
create index if not exists provider_calls_user_started_idx on provider_calls(user_id, started_at desc);

create table if not exists user_preference_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  positive_count int not null default 0,
  negative_count int not null default 0,
  positive_vector vector(1536),
  negative_vector vector(1536),
  updated_at timestamptz not null default now()
);


