create table aggregate_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope_type text not null check (scope_type in ('digest', 'inbox', 'range', 'custom')),
  scope_hash text not null,
  digest_id uuid null references digests(id) on delete cascade,
  topic_id uuid null references topics(id) on delete cascade,
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

create unique index aggregate_summaries_user_scope_hash on aggregate_summaries(user_id, scope_hash);
create index aggregate_summaries_digest_id on aggregate_summaries(digest_id);
create index aggregate_summaries_topic_scope on aggregate_summaries(topic_id, scope_type);
