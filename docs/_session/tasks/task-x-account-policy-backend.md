# Task: feat(x_posts): account policy table + ingest gating + API

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Add data-driven, gradual throttling for X accounts based on feedback, with a new policy table, deterministic sampling during ingest, and admin API endpoints to expose/update/reset per-account policy state.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/spec.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/pipeline.md`
- `docs/connectors.md` (x_posts section)
- `docs/budgets.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/workflows/opus-task-generator.md`
- `docs/workflows/task-template.md`
- `packages/connectors/src/x_posts/fetch.ts`
- `packages/connectors/src/x_posts/normalize.ts`
- `packages/pipeline/src/stages/ingest.ts`
- `packages/pipeline/src/scheduler/run.ts`
- `packages/api/src/routes/feedback.ts`
- `packages/api/src/routes/admin.ts`
- `packages/db/src/repos/feedback_events.ts`

### Scope (allowed files)

- `packages/db/migrations/0023_x_account_policies.sql` (new)
- `docs/data-model.md`
- `docs/connectors.md` (x_posts section)
- `docs/pipeline.md` (ingest section, if needed)
- `packages/shared/src/types/x_account_policy.ts` (new)
- `packages/shared/src/types/index.ts`
- `packages/shared/src/x_account_policy.ts` (new)
- `packages/shared/src/index.ts`
- `packages/shared/src/utils/hash.ts` (if needed for deterministic sampling)
- `packages/db/src/repos/x_account_policies.ts` (new)
- `packages/db/src/index.ts`
- `packages/db/src/db.ts`
- `packages/api/src/routes/admin.ts`
- `packages/api/src/routes/feedback.ts`
- `packages/api/src/routes/items.ts` (only if backend needs to attach policy info to feed; optional)
- `packages/pipeline/src/stages/ingest.ts`
- `packages/pipeline/src/lib/x_account_policy.ts` (new, if you prefer pipeline-local helpers)
- `packages/pipeline/src/stages/ingest.test.ts` or new test file (optional, if existing patterns allow)
- `packages/pipeline/src/budgets/credits.test.ts` (not expected)

If anything else seems required, STOP and ask before changing.

### Decisions (record; if unclear STOP and ask)

Already decided with driver:
- Use a **new table** for per-account policy (no config-only storage).
- **Reset** only throttling stats (do NOT erase feedback history or preference profiles).
- **No auto-mute**: auto mode can reduce to exploration floor; Mute is user-forced only.
- UI placement: X source config (handled in separate UI task).
- Behavior must be **gradual** (no big jumps), with decay + smoothing + exploration floor.

Defaults to implement (tunable later):
- Half-life: **45 days**.
- Exploration floor: **15%**.
- Minimum sample before throttling: **5**.
- Smoothing: Beta(1,1) Laplace prior.
- Score-to-throttle mapping: smoothstep from 0.35..0.65 → 0.15..1.0.
- Mode labels: **Auto / Always fetch / Mute**.

Open questions: none.

### Implementation steps (ordered)

1) **DB migration + docs**
   - Create `x_account_policies` table keyed by `(source_id, handle)`.
   - Columns (suggested):
     - `source_id uuid not null references sources(id) on delete cascade`
     - `handle text not null` (store lowercase, without `@`)
     - `mode text not null default 'auto'` (allowed: auto | always | mute)
     - `pos_score double precision not null default 0`
     - `neg_score double precision not null default 0`
     - `last_feedback_at timestamptz` (nullable)
     - `last_updated_at timestamptz` (nullable; set when decay applied)
     - `created_at timestamptz not null default now()`
     - `updated_at timestamptz not null default now()`
     - add a CHECK constraint for `mode` values
   - Add unique index on `(source_id, handle)`.
   - Update `docs/data-model.md` with the new table and constraints.
   - Add short note in `docs/connectors.md` under `x_posts` about feedback-driven throttling and per-account overrides.

2) **Shared policy math + types**
   - Add `packages/shared/src/types/x_account_policy.ts`:
     - `XAccountPolicyMode = "auto" | "always" | "mute"`
     - `XAccountPolicyState = "normal" | "reduced" | "muted"`
     - `XAccountPolicyRow` (shape from DB)
     - `XAccountPolicyView` with derived fields: `score`, `sample`, `throttle`, `state`, `nextLike`, `nextDislike`.
   - Add `packages/shared/src/x_account_policy.ts` implementing:
     - `normalizeHandle(handle: string): string` (lowercase, strip `@`).
     - `applyDecay(pos, neg, lastUpdatedAt, now)` using half-life 45 days.
     - `applyFeedbackDelta` for actions (like/save +1, dislike -1, skip 0).
     - `computeScore(pos, neg)` with Laplace smoothing.
     - `computeThrottle(score, sample)` with min-sample gating + smoothstep mapping + floor.
     - `resolveState(mode, throttle)` (mute → muted; auto+throttle<0.9 → reduced; else normal).
     - `computePolicyView(row, now)` returns derived view.
     - `computeNextEffects(row, now)` returns next-like/dislike views without mutating DB.
     - `deterministicSample(key, threshold)` using sha256 → [0,1).
   - Export from `packages/shared/src/index.ts`.

3) **DB repo: x_account_policies**
   - Create `packages/db/src/repos/x_account_policies.ts` with functions:
     - `listBySourceAndHandles({ sourceId, handles })`
     - `upsertDefaults({ sourceId, handles })` (insert missing rows with defaults)
     - `applyFeedback({ sourceId, handle, action, occurredAt })`:
       - load row, decay to `occurredAt`, apply delta, update `pos_score`, `neg_score`, `last_feedback_at`, `last_updated_at`, `updated_at`.
     - `resetPolicy({ sourceId, handle })`:
       - set `pos_score=0`, `neg_score=0`, `last_feedback_at=null`, `last_updated_at=now`, `updated_at=now`.
     - `updateMode({ sourceId, handle, mode })`.
     - `recomputeFromFeedback({ sourceId, handle })` (optional):
       - query feedback events for that handle + source (ordered by created_at), apply decay sequentially, write row.
   - Wire repo in `packages/db/src/index.ts` + `packages/db/src/db.ts`.

4) **Admin API endpoints**
   - In `packages/api/src/routes/admin.ts` add:
     - `GET /admin/sources/:id/x-account-policies`
       - Validate source exists and is `x_posts`.
       - Extract handles from config `accounts` and `batching.groups` (ignore `queries`).
       - Normalize handles, upsert default rows, compute `XAccountPolicyView` for each, return list.
       - Return explicit empty list + reason if no accounts.
     - `PATCH /admin/sources/:id/x-account-policies/mode` with `{ handle, mode }`.
     - `POST /admin/sources/:id/x-account-policies/reset` with `{ handle }`.
   - Use shared policy helpers to compute derived fields for response.

5) **Update feedback pipeline**
   - In `packages/api/src/routes/feedback.ts` after inserting feedback:
     - If content item is `x_posts` (source_type), get source_id(s) via content_item_sources.
     - Extract handle from `content_items.author` (strip `@`, lowercase). If missing, skip.
     - Call `xAccountPolicies.applyFeedback` for each source_id.
   - In DELETE `/feedback` path, after deleting:
     - If item is `x_posts`, call `recomputeFromFeedback` for each source_id + handle.
   - Do NOT clear feedback history; only recompute policy stats.

6) **Ingest gating (deterministic)**
   - In `packages/pipeline/src/stages/ingest.ts`:
     - Before calling `connector.fetch` for `x_posts`, apply account gating.
     - Build effective handle list from config (accounts + batching groups).
     - Fetch policy views for those handles (DB repo + shared math).
     - Decide `include` per handle:
       - mode=always → include
       - mode=mute → exclude
       - auto:
         - if `sample < MIN_SAMPLE`, include
         - else include if deterministicSample(`sourceId|handle|windowEnd`) < `throttle`
     - Rewrite config:
       - filter `accounts`
       - filter `batching.groups` (drop empty groups)
       - if `queries` present, **skip gating** (explicit queries are not account-scoped)
     - If all accounts removed and no queries, allow fetch to run (it should return empty and make no provider calls).
   - Add a log line (info/debug) showing included vs excluded counts for transparency.

7) **Tests (minimum)**
   - Add unit tests for shared policy math (decay + throttle mapping + deterministic sampling).
   - Add a small test for gating decision (auto vs always vs mute) if convenient.

### Acceptance criteria

- [ ] New `x_account_policies` table exists with correct constraints and docs updated.
- [ ] Feedback on x_posts updates policy stats (like/save positive, dislike negative).
- [ ] Reset endpoint zeros **policy stats only** (feedback history unaffected).
- [ ] Ingest gating reduces X account queries deterministically without random flapping.
- [ ] Auto mode never fully mutes; exploration floor enforced.
- [ ] No behavior change for non-x_posts sources.

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
pnpm test --filter x_account_policy -- --runInBand
```

(If no tests added, say "Not run (no new tests)".)

### Commit

- **Message**: `feat(x_posts): add account policy gating + admin API`
- **Files expected**:
  - `packages/db/migrations/0023_x_account_policies.sql`
  - `docs/data-model.md`
  - `docs/connectors.md`
  - `packages/shared/src/types/x_account_policy.ts`
  - `packages/shared/src/types/index.ts`
  - `packages/shared/src/x_account_policy.ts`
  - `packages/shared/src/index.ts`
  - `packages/db/src/repos/x_account_policies.ts`
  - `packages/db/src/index.ts`
  - `packages/db/src/db.ts`
  - `packages/api/src/routes/admin.ts`
  - `packages/api/src/routes/feedback.ts`
  - `packages/pipeline/src/stages/ingest.ts`
  - (tests if added)

Commit instructions:
- Make exactly **one commit** per task spec.
- If you had to touch files outside **Scope**, stop and ask before committing.

### Final step (required): write task report files (no copy/paste)

After committing, write a short task report to:

- `docs/_session/results/latest.md` (overwrite each task)

Then print only:

```text
WROTE REPORT: docs/_session/results/latest.md
```
