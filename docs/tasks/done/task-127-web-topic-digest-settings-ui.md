# Task 127 — `feat(web): topic digest cadence + depth settings UI (with explainers)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a user-facing UI to configure **topic digest scheduling and depth**, aligned with the spec:

- `docs/tasks/task-120-topic-digest-cadence-spec.md`

Users should be able to set:

- digest cadence per topic (daily/weekly/custom interval)
- digest mode (low/normal/high)
- depth slider (0–100)

And they should see clear explanations + derived values so non-technical users understand the tradeoffs.

Depends on:

- Task 122 API: `PATCH /topics/:id/digest-settings`
- Task 124 pipeline: digest plan compilation (for derived preview accuracy; UI can also compute locally using same formula)

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-120-topic-digest-cadence-spec.md`
- Code:
  - `packages/web/src/app/app/topics/page.tsx` (topic settings UI)
  - `packages/web/src/components/HelpTooltip/HelpTooltip.tsx` (popover help)
  - `packages/web/src/lib/api.ts` (Topic type)
  - `packages/web/src/lib/hooks.ts` (React Query mutations)

## Scope (allowed files)

- `packages/web/src/app/app/topics/page.tsx`
- `packages/web/src/app/app/topics/page.module.css`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- `packages/web/src/components/*` (new small reusable component allowed)

If you need to change API routes or DB schema, stop (that’s Tasks 121–123).

## Decisions (already decided)

- Cadence is explicit per topic; source cadence unchanged.
- No `catch_up`.
- `high` aims for 100+ digest items.
- Recency is not a primary driver; this UI is about “best ideas”, not “latest”.

## UI requirements (what to build)

Add a new section inside each expanded topic card on `/app/topics`:

### 1) Section: “Digest schedule”

Fields:

1. **Enable scheduled digests** (toggle)
   - binds to `topic.digestScheduleEnabled`

2. **Cadence preset** (select):
   - Daily → 1440 minutes
   - Weekly → 10080 minutes
   - Custom → show number input

3. **Custom interval** (number input, minutes)
   - visible only when preset=Custom
   - min=15, max=43200
   - binds to `topic.digestIntervalMinutes`

Help popover copy should explain:

- this controls how often a digest is generated for this topic
- sources still obey their own cadences (some sources may be skipped if not due)
- if the worker was offline, it will backfill missed windows automatically

### 2) Section: “Digest depth”

Fields:

1. **Mode** (segmented control or radio):
   - low / normal / high
   - binds to `topic.digestMode`

2. **Depth slider** (0..100)
   - binds to `topic.digestDepth`
   - label it in human terms (e.g., “More coverage / more cost”)

Help popover copy should explain:

- higher depth increases:
  - number of digest items
  - number of LLM triage calls
  - number of deep summaries
- high is meant for deep dives; normal is default; low is cheap

### 3) Derived preview (must show live as user edits)

Show a small “This will do…” box that updates as the user changes settings.

Derived values to display (computed locally using Task 120 formula):

- **Estimated digest items** (target): `digestMaxItems`
- **Estimated triage calls**: `triageMaxCalls`
- **Estimated deep summaries**: `deepSummaryMaxCalls`

Also display:

- **Enabled sources in topic**: `S` (count sources where `topicId==topic.id && isEnabled`)

If Task 124 lands first, prefer importing a shared “compileDigestPlan” implementation into web (or re-implement the same formula in web with a comment: “must stay in sync with pipeline compiler”).

### 4) Save UX

Two acceptable patterns (pick one):

- **A (preferred)**: inline “Save” / “Cancel” buttons for digest settings per topic (like existing source edit forms)
- **B**: auto-save with debounce + toast (more complex; avoid unless already used elsewhere)

On success:

- toast: “Digest settings updated”
- refetch topics query

On error:

- show inline error + toast

### 5) Copy updates

Add new strings in `en.json` for:

- section headers
- help tooltip content
- toasts/errors
- label text for presets and modes

## Acceptance criteria

- [ ] Each topic card shows digest schedule + depth controls when expanded.
- [ ] User can enable/disable schedule, set daily/weekly/custom interval, choose mode, adjust depth.
- [ ] Derived preview updates live and matches the formula in Task 120.
- [ ] Changes persist via API and remain after reload.
- [ ] `pnpm -r typecheck` passes.

## Test plan

```bash
pnpm dev:web
pnpm dev:api
```

- Open `/app/topics`, expand a topic, adjust digest settings, click Save.
- Reload page and confirm values persist.
- Verify derived preview changes when toggling source enable/disable in the same topic.

## Commit

- **Message**: `feat(web): topic digest schedule and depth settings UI`
- **Files expected**:
  - `packages/web/src/app/app/topics/page.tsx`
  - `packages/web/src/app/app/topics/page.module.css`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - (optional) `packages/web/src/components/TopicDigestSettings/*`
