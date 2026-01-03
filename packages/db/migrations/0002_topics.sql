-- Topics/collections + topic-scoped digests.
-- See ADR 0008.

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists topics_user_name_uniq on topics(user_id, name);
create index if not exists topics_user_created_idx on topics(user_id, created_at desc);

-- Ensure every existing user has a default topic.
insert into topics (user_id, name)
select id, 'default' from users
on conflict (user_id, name) do nothing;

-- Sources belong to a topic (MVP: exactly one).
alter table sources add column if not exists topic_id uuid;

update sources s
set topic_id = t.id
from topics t
where s.topic_id is null
  and t.user_id = s.user_id
  and t.name = 'default';

alter table sources
  alter column topic_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sources_topic_id_fkey') then
    alter table sources
      add constraint sources_topic_id_fkey foreign key (topic_id) references topics(id) on delete cascade;
  end if;
end $$;

create index if not exists sources_topic_idx on sources(topic_id);

-- Track all (content_item, source) associations so topic membership/provenance survives URL dedupe.
create table if not exists content_item_sources (
  content_item_id uuid not null references content_items(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (content_item_id, source_id)
);
create index if not exists content_item_sources_source_idx on content_item_sources(source_id);

insert into content_item_sources (content_item_id, source_id)
select id, source_id from content_items
where source_id is not null
on conflict do nothing;

-- Digests become topic-scoped.
alter table digests add column if not exists topic_id uuid;

update digests d
set topic_id = t.id
from topics t
where d.topic_id is null
  and t.user_id = d.user_id
  and t.name = 'default';

alter table digests
  alter column topic_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'digests_topic_id_fkey') then
    alter table digests
      add constraint digests_topic_id_fkey foreign key (topic_id) references topics(id) on delete cascade;
  end if;
end $$;

-- Replace old unique index with topic-aware one.
drop index if exists digests_user_window_mode_uniq;
create unique index if not exists digests_user_topic_window_mode_uniq
  on digests(user_id, topic_id, window_start, window_end, mode);


