# Task 133 — `feat(web+api): admin tuning UI for personalization settings`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expose **personalization tuning controls** in the Admin UI so the driver can experiment without code changes.

The UI must:

- Read/write `user_preferences.custom_settings`
- Provide **heavy explanation** and safety notes for each control
- Preserve unknown keys in `custom_settings` (no destructive overwrite)
- Offer a **Reset to defaults** button

This task does **not** implement A/B tests (explicitly deferred).

## Read first (required)

- `AGENTS.md`
- `docs/web.md`
- `docs/pipeline.md`
- `docs/data-model.md`
- Code:
  - `packages/api/src/routes/preferences.ts`
  - `packages/web/src/app/app/admin/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`

## Scope (allowed files)

- API:
  - `packages/api/src/routes/preferences.ts`
- Shared types:
  - `packages/shared/src/types/*`
  - `packages/shared/src/index.ts`
- Web:
  - `packages/web/src/app/app/admin/page.tsx`
  - `packages/web/src/app/app/admin/page.module.css`
  - `packages/web/src/app/app/admin/tuning/page.tsx`
  - `packages/web/src/app/app/admin/tuning/page.module.css`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`

If you need new endpoints or schema changes, **stop and ask**.

## Decisions (pending driver input)

Use the same decisions from Task 132:

- Custom settings key (proposed `custom_settings.personalization_tuning_v1`)
- Defaults + clamp ranges

## Implementation requirements

### 1) Shared tuning types (required)

Use the same `PersonalizationTuningV1` and parser from Task 132. Do **not** duplicate schema logic.

### 2) API validation + merge (required)

In `packages/api/src/routes/preferences.ts`:

- Accept `customSettings` in PATCH as before, but **validate and clamp**
  `custom_settings.personalization_tuning_v1` if present.
- Do **not** discard unknown keys. Merge by:
  - `nextCustomSettings = { ...existing, ...incoming, personalization_tuning_v1: parsed }`
- If payload includes invalid values outside allowed ranges, return 400 with a clear message

### 3) Admin UI page (required)

Create `/app/admin/tuning` page with:

- “Back to Admin” link
- Summary of current effective tuning values (resolved)
- Sliders or number inputs for:
  - `prefBiasSamplingWeight` (0–0.5)
  - `prefBiasTriageWeight` (0–0.5)
  - `rankPrefWeight` (0–0.5)
  - `feedbackWeightDelta` (0–0.2)
- Each control must include **clear explanation**:
  - what it affects (sampling / triage / ranking)
  - tradeoffs (echo‑chamber risk vs personalization strength)
  - cost impact (should be “no extra LLM calls”)
- A “Reset to defaults” button
- Save button with optimistic UI + toast feedback

Use existing Admin layout styles (do not introduce new design language).

### 4) Wire data flow (required)

- Use `usePreferences()` to load preferences
- Use `useUpdatePreferences()` to PATCH custom settings
- Preserve other custom settings keys on save
- Use `PersonalizationTuningResolved` from the shared parser for display

### 5) Admin landing page link (required)

Add a card on `/app/admin` linking to `/app/admin/tuning` with localized strings.

### 6) Localization (required)

Add strings to `packages/web/src/messages/en.json` for:

- Admin card title/description
- Tuning page labels, explanations, helper text, button labels

### 7) Docs (recommended)

Update `docs/pipeline.md` (or `docs/web.md`) with a short note about
admin personalization tuning and the storage key.

## Acceptance criteria

- [ ] Admin page shows current tuning values and saves updates
- [ ] Invalid values are rejected server‑side with helpful errors
- [ ] Unknown `custom_settings` keys are preserved
- [ ] Clear explanations are visible for each control
- [ ] No A/B testing or experiments are introduced

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# manual smoke
pnpm dev
# open /app/admin/tuning, adjust sliders, save, refresh, confirm persistence
```

## Commit

- **Message**: `feat(web): admin personalization tuning controls`
- **Files expected**:
  - `packages/api/src/routes/preferences.ts`
  - `packages/web/src/app/app/admin/page.tsx`
  - `packages/web/src/app/app/admin/page.module.css`
  - `packages/web/src/app/app/admin/tuning/page.tsx`
  - `packages/web/src/app/app/admin/tuning/page.module.css`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `packages/shared/src/types/*`
  - `packages/shared/src/index.ts`
  - `docs/pipeline.md` (if updated)
