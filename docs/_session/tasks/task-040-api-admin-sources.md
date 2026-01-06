# Task 040 — `feat(api): add admin sources endpoints for UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add the missing API endpoints needed for a feature-complete Sources UI:

- list sources for the singleton user/topic
- update source fields (enable/disable, name)
- patch `config_json` for cadence + weight (and preserve unknown keys)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md` (update the contract to include these endpoints)
- `docs/data-model.md` (sources schema + config_json)
- `docs/adr/0009-source-cadence.md`
- Code:
  - `packages/api/src/routes/admin.ts`
  - `packages/db/src/repos/sources.ts`

## Scope (allowed files)

- `docs/api.md`
- `packages/api/src/routes/admin.ts`
- (optional) `packages/api/src/lib/validation.ts` (small helpers only)
- (optional) `packages/db/src/repos/sources.ts` (add missing repo methods if needed)

If anything else seems required, **stop and ask**.

## Decisions (already decided — do not re-ask)

- Single-user MVP: endpoints operate on the singleton `(userId, topicId)` context.
- Auth: API key header only for now.
- UI needs to edit:
  - `sources.is_enabled`
  - `sources.name`
  - `sources.config_json.cadence` (interval cadence)
  - `sources.config_json.weight` (number)

## Endpoints to implement (contract)

1. `GET /api/admin/sources`
   - returns list of sources for current topic
2. `PATCH /api/admin/sources/:id`
   - body supports:
     - `name?: string`
     - `isEnabled?: boolean`
     - `configPatch?: { cadence?: { mode:"interval", every_minutes:number } | null; weight?: number | null }`
   - patch semantics:
     - merge into existing config_json
     - if cadence is null: remove cadence key
     - if weight is null: remove weight key

## Implementation steps (ordered)

1. Update `docs/api.md` to document the new endpoints (request/response + errors).
2. Implement `GET /api/admin/sources`:
   - query sources by `(user_id, topic_id)`
   - return stable JSON shape (id, type, name, isEnabled, config, cursor)
3. Implement `PATCH /api/admin/sources/:id`:
   - validate UUID
   - enforce source belongs to current user/topic (else 403)
   - apply patch semantics and update the row
4. Ensure consistent error envelopes.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] Endpoints work against a seeded DB.
- [ ] Patching preserves unknown config keys and does not wipe config_json.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Manual smoke (requires API running + seeded sources):
# curl -H "X-API-Key: ..." http://localhost:3000/api/admin/sources
```

## Commit

- **Message**: `feat(api): add admin sources endpoints for UI`
- **Files expected**:
  - `docs/api.md`
  - `packages/api/src/routes/admin.ts`
  - (optional) `packages/db/src/repos/sources.ts`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.


