-- Topic-scoped preference profiles derived from feedback + embeddings.
-- This enables personalization without mixing unrelated topics.

create table if not exists topic_preference_profiles (
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  positive_count int not null default 0,
  negative_count int not null default 0,
  positive_vector vector(1536),
  negative_vector vector(1536),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create index if not exists topic_preference_profiles_user_updated_idx
  on topic_preference_profiles(user_id, updated_at desc);


