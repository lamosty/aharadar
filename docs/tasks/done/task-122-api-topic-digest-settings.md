# Task 122 — `feat(api): topic digest settings endpoints + remove catch_up`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expose the new **topic digest scheduling + depth** settings over the HTTP API, and remove `catch_up` from public API/UI surfaces.

This task depends on DB schema from:

- `docs/tasks/task-121-db-topic-digest-settings.md`

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- `docs/tasks/task-121-db-topic-digest-settings.md`
- Code:
  - `packages/api/src/routes/topics.ts`
  - `packages/api/src/routes/admin.ts`
  - `packages/web/src/app/app/admin/run/page.tsx`
  - `packages/web/src/lib/api.ts`

## Scope (allowed files)

- `packages/api/src/routes/topics.ts`
- `packages/api/src/routes/admin.ts`
- `packages/web/src/app/app/admin/run/page.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json` (copy)

If you need to change pipeline/worker behavior, **stop and ask** (Task 123+).

## Decisions (already decided)

- Modes are only `low | normal | high`. Remove `catch_up` from UI/API types.
- Topic digest cadence is explicit per topic (interval minutes).

## API contract changes

### 1) Extend topic responses

Update topic response shape returned by:

- `GET /topics`
- `GET /topics/:id`

Add fields (snake_case in DB, camelCase in API):

```ts
digestScheduleEnabled: boolean;
digestIntervalMinutes: number;
digestMode: "low" | "normal" | "high";
digestDepth: number; // 0..100
digestCursorEnd: string | null; // ISO
```

### 2) Add endpoint: PATCH topic digest settings

Add:

- `PATCH /topics/:id/digest-settings`

Request body (all optional):

```json
{
  "digestScheduleEnabled": true,
  "digestIntervalMinutes": 1440,
  "digestMode": "normal",
  "digestDepth": 50
}
```

Validation rules:

- `digestScheduleEnabled`: boolean
- `digestIntervalMinutes`: integer in `[15, 43200]`
- `digestMode`: `"low"|"normal"|"high"`
- `digestDepth`: integer in `[0, 100]`

Response:

```json
{ "ok": true, "topic": <topic> }
```

### 3) Remove catch_up from admin run API

Update `POST /admin/run`:

- `mode` validation and types must exclude `catch_up`.
- If the request includes `catch_up`, return 400 with a clear error message.

Update the web Admin Run page UI to remove the “catch up” radio option.

## Implementation notes

- Prefer reusing existing `formatTopic(...)` in `topics.ts`.
- Use the DB repo method `topics.updateDigestSettings(...)` from Task 121.
- Keep endpoints consistent with the existing style: validate UUID, verify ownership, validate body shape.

## Acceptance criteria

- [ ] `GET /topics` and `GET /topics/:id` return the new digest fields.
- [ ] `PATCH /topics/:id/digest-settings` updates the fields and returns the updated topic.
- [ ] Admin run endpoint and UI no longer accept/show `catch_up`.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r test

# manual smoke
pnpm dev:api
pnpm dev:web
# UI: Settings/Topics page shows digest fields once UI task lands; for now just verify Admin Run has no catch_up.
```

## Commit

- **Message**: `feat(api): expose topic digest settings`
- **Files expected**:
  - `packages/api/src/routes/topics.ts`
  - `packages/api/src/routes/admin.ts`
  - `packages/web/src/app/app/admin/run/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json` (if copy changes)
