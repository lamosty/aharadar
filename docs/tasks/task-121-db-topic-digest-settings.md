# Task 121 — `feat(db): store topic digest schedule + depth (and purge catch_up digests)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add DB support for **topic-level digest scheduling and depth tuning**, per the contract in:

- `docs/tasks/task-120-topic-digest-cadence-spec.md`

Also add a one-time cleanup that deletes any legacy digests with `mode='catch_up'`.

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- `docs/data-model.md` (update in Task 120; treat as contract)
- Code:
  - `packages/db/src/repos/topics.ts`
  - `packages/db/migrations/*`

## Scope (allowed files)

- `packages/db/migrations/*.sql` (new migration(s) only)
- `packages/db/src/repos/topics.ts`
- `packages/db/src/repos/digests.ts` (types only if needed)
- `packages/db/src/index.ts` (export types if needed)

If you think you need to change API/web/pipeline in this task, **stop and ask** (that’s Task 122+).

## Decisions (already decided)

- `catch_up` is removed going forward. Any existing `digests.mode='catch_up'` should be deleted.
- Topic digest schedule is **explicit per topic** (interval minutes), not derived from source cadences.

## Data model changes (required)

### A) Add topic digest settings columns

Create a new migration `00xx_topic_digest_schedule.sql` (choose next number) that adds to `topics`:

- `digest_schedule_enabled boolean not null default true`
- `digest_interval_minutes integer not null default 1440`
  - check: `digest_interval_minutes >= 15 and digest_interval_minutes <= 43200`
- `digest_mode text not null default 'normal'`
  - check: in `('low','normal','high')`
- `digest_depth integer not null default 50`
  - check: `digest_depth >= 0 and digest_depth <= 100`
- `digest_cursor_end timestamptz null`
  - no default

Add helpful comments to columns (Postgres `COMMENT ON COLUMN ...`).

Add index (optional but recommended):

- `topics_user_digest_cursor_idx` on `(user_id, digest_cursor_end)`

### B) Purge legacy catch_up digests

In the same migration (or a dedicated one directly after), delete old rows:

- `delete from digests where mode = 'catch_up'`

Rely on `ON DELETE CASCADE` from `digest_items` to remove related rows.

> Note: Do **not** add backwards-compat logic. This repo prefers “reset/migrate” over shims.

## DB repo updates (required)

Update `packages/db/src/repos/topics.ts`:

1. Extend `TopicRow` / `Topic` / `formatTopic` surfaces to include:
   - `digest_schedule_enabled`
   - `digest_interval_minutes`
   - `digest_mode`
   - `digest_depth`
   - `digest_cursor_end`

2. Update `listByUser`, `getById`, `getByName`, `create`, `getFirstByUserId`, `getOrCreateDefaultForUser` to select/return the new columns.

3. Add repo methods:

- `updateDigestSettings(topicId, updates)`
  - supports patch semantics for:
    - `digestScheduleEnabled?: boolean`
    - `digestIntervalMinutes?: number`
    - `digestMode?: 'low'|'normal'|'high'`
    - `digestDepth?: number`
  - enforces min/max constraints server-side (clamp or reject; prefer reject in DB repo and let API validate)

- `updateDigestCursorEnd(topicId, cursorEndIso)`
  - sets `digest_cursor_end = $cursorEnd`
  - used only by scheduled runs (worker will call it later)

## Acceptance criteria

- [ ] Migration applies cleanly on a fresh DB and on an existing dev DB.
- [ ] `topics` rows have the new columns with correct defaults.
- [ ] Any `digests.mode='catch_up'` rows are deleted by the migration.
- [ ] DB topic repo returns the new fields and can update them.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
./scripts/migrate.sh

# Optional sanity checks (psql):
# select name, digest_schedule_enabled, digest_interval_minutes, digest_mode, digest_depth, digest_cursor_end from topics;
# select count(*) from digests where mode='catch_up';
```

## Commit

- **Message**: `feat(db): add topic digest schedule + depth`
- **Files expected**:
  - `packages/db/migrations/00xx_topic_digest_schedule.sql` (and/or a second migration)
  - `packages/db/src/repos/topics.ts`
  - (optional) `packages/db/src/repos/digests.ts` (types only)
