# Task 130 — `refactor(topics): unify digest frequency + decay (remove viewing profile UI/API)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Unify **topic digest frequency** and **recency decay** so users only configure a single schedule. Remove viewing profile UI/API, but keep `decay_hours` stored (derived from `digest_interval_minutes`) and keep **Mark as caught up** + NEW badges.

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- `docs/recaps/recap-2026-01-07T2150Z-topics-viewing-profile.md`
- Code:
  - `packages/db/src/repos/topics.ts`
  - `packages/api/src/routes/topics.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/web/src/app/app/topics/page.tsx`
  - `packages/web/src/components/TopicViewingProfile/*`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`

## Scope (allowed files)

- `packages/db/src/repos/topics.ts`
- `packages/api/src/routes/topics.ts`
- `packages/api/src/routes/items.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/web/src/app/app/topics/page.tsx`
- `packages/web/src/components/TopicViewingProfile/*` (remove usage; may delete components if unused)
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- `docs/api.md`
- `docs/web.md`
- `docs/data-model.md` (document deprecation of viewing_profile)

If anything else seems required, stop and ask before changing.

## Decisions (Driver Q&A)

- **Decay derivation formula**: `decay_hours = round(digest_interval_minutes / 60)`.
- **Viewing profile**: keep DB column for now but **remove from API/UI**; document as deprecated.

## Implementation steps (ordered)

1. **Derive decay from interval in DB repo** (`topics.updateDigestSettings`):
   - When `digestIntervalMinutes` is updated, also update `decay_hours` using the chosen formula.
   - When creating a topic, initialize `decay_hours` from default `digest_interval_minutes` (1440 → 24).

2. **Remove viewing profile API**:
   - Delete `PATCH /topics/:id/viewing-profile` route.
   - Remove `viewingProfile` + `decayHours` inputs from `POST /topics` and API types.

3. **Feed uses topic decay + last_checked_at**:
   - In `GET /items`, compute decay using `topics.decay_hours` (not `user_preferences`).
   - For NEW flags, use `topics.last_checked_at` (topic‑specific), not user preferences.

4. **Pipeline ranking uses derived decay**:
   - In `packages/pipeline/src/stages/digest.ts`, use topic `decay_hours` (derived) for `rankCandidates`.

5. **UI cleanup**:
   - Remove Viewing Profile section from `/app/topics` and delete related components if unused.
   - Remove profile badges from topic card header.

6. **Docs update**:
   - Update docs to reflect “frequency drives decay; viewing profile is deprecated.”

## Acceptance criteria

- [ ] Topics UI shows only digest schedule + depth (no viewing profile).
- [ ] `decay_hours` is automatically derived from `digest_interval_minutes`.
- [ ] Feed NEW badges use topic `last_checked_at`.
- [ ] Feed decay uses topic `decay_hours` (not user preferences).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
# manual
pnpm dev:api
pnpm dev:web
# 1) Create topic, set schedule to weekly → decay_hours ~168.
# 2) Mark caught up, verify NEW badges reset for that topic.
```

## Commit

- **Message**: `refactor(topics): derive decay from digest schedule`
- **Files expected**:
  - `packages/db/src/repos/topics.ts`
  - `packages/api/src/routes/topics.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/web/src/app/app/topics/page.tsx`
  - `packages/web/src/components/TopicViewingProfile/*`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `docs/api.md`
  - `docs/web.md`
  - `docs/data-model.md`
