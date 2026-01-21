-- Bookmarks table for saving content items
create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Ensure each user can only bookmark an item once
create unique index bookmarks_user_item_uniq on bookmarks(user_id, content_item_id);

-- For listing bookmarks by user, newest first
create index bookmarks_user_created_idx on bookmarks(user_id, created_at desc);
