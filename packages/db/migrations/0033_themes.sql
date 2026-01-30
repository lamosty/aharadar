-- Themes: topic-level grouping for feed inbox
-- Unlike clusters (0.86 similarity for near-duplicates), themes use 0.65 threshold
-- for broader topic grouping. Themes help reduce ~200 items/day to ~20 collapsible groups.

-- Themes table - stores theme metadata and centroid
create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  representative_content_item_id uuid references content_items(id) on delete set null,
  centroid_vector vector(1536),
  label text,  -- Auto-generated from representative item title
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HNSW index for fast centroid similarity search
create index if not exists themes_centroid_hnsw
  on themes using hnsw (centroid_vector vector_cosine_ops);

-- Index for finding themes by topic/user (common query pattern)
create index if not exists themes_topic_user_idx
  on themes(topic_id, user_id, updated_at desc);

-- Theme items junction table
create table if not exists theme_items (
  theme_id uuid not null references themes(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  similarity real not null,
  added_at timestamptz not null default now(),
  primary key (theme_id, content_item_id)
);

-- Index for finding theme by content item (for API lookups)
create index if not exists theme_items_content_idx
  on theme_items(content_item_id);
