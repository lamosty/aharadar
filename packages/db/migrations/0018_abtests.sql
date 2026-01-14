-- AB-test tables for comparing LLM triage configurations

-- abtest_runs: one row per AB-test experiment
create table if not exists abtest_runs (
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
create index if not exists abtest_runs_user_created_idx on abtest_runs(user_id, created_at desc);
create index if not exists abtest_runs_status_idx on abtest_runs(status);

-- abtest_variants: LLM configurations to compare (2+ per run)
create table if not exists abtest_variants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references abtest_runs(id) on delete cascade,
  name text not null,
  provider text not null,
  model text not null,
  reasoning_effort text, -- low|medium|high (optional)
  max_output_tokens int,
  "order" int not null default 1
);
create index if not exists abtest_variants_run_idx on abtest_variants(run_id);

-- abtest_items: content items to triage (with snapshot)
create table if not exists abtest_items (
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
create index if not exists abtest_items_run_idx on abtest_items(run_id);

-- abtest_results: per-item, per-variant triage output
create table if not exists abtest_results (
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
create unique index if not exists abtest_results_item_variant_uniq on abtest_results(abtest_item_id, variant_id);
create index if not exists abtest_results_variant_idx on abtest_results(variant_id);
