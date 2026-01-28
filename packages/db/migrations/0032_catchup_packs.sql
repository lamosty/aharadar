-- Catch-up packs table for on-demand listwise selection
-- Also adds per-item read tracking for inbox filtering

create table if not exists catchup_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  scope_type text not null check (scope_type in ('range')),
  scope_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'complete', 'error', 'skipped')),
  summary_json jsonb,
  prompt_id text,
  schema_version text,
  provider text,
  model text,
  input_item_count int,
  input_char_count int,
  input_tokens int,
  output_tokens int,
  cost_estimate_credits numeric,
  meta_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catchup_packs_user_scope_hash
  on catchup_packs(user_id, scope_hash);
create index if not exists catchup_packs_topic_created
  on catchup_packs(topic_id, created_at desc);
create index if not exists catchup_packs_user_created
  on catchup_packs(user_id, created_at desc);

create table if not exists content_item_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  pack_id uuid null references catchup_packs(id) on delete set null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists content_item_reads_user_item_uniq
  on content_item_reads(user_id, content_item_id);
create index if not exists content_item_reads_user_read_at_idx
  on content_item_reads(user_id, read_at desc);
create index if not exists content_item_reads_pack_idx
  on content_item_reads(pack_id);
