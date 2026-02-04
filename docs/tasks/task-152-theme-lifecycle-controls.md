# Task 152 — `feat(themes): theme lifecycle + drift controls`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

## Goal

Prevent long‑lived or overly broad themes (e.g., giant “Bitcoin” buckets). Add lifecycle controls (age/size/cohesion) so theme grouping remains tight, stable, and useful at high volume.

## Read first (contracts + code)

- `AGENTS.md`
- `docs/spec.md`
- `docs/architecture.md`
- `docs/pipeline.md`
- `docs/llm.md`
- `packages/pipeline/src/stages/digest.ts`
- `packages/shared/src/types/theme_tuning.ts`
- `packages/web/src/components/Feed/ThemeRow.tsx`
- `packages/web/src/app/app/admin/tuning/page.tsx`

## Scope (allowed files)

- `docs/pipeline.md`
- `packages/shared/src/types/theme_tuning.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/web/src/components/Feed/ThemeRow.tsx`
- `packages/web/src/app/app/admin/tuning/page.tsx`

If anything else seems required, stop and ask before changing.

## Decisions (if any)

- Pick lifecycle controls (defaults):
  - `maxThemeAgeDays` (e.g., 7–21)
  - `maxThemeItems` (cap before forcing splits)
  - `minCohesion` or `maxLabelEntropy` threshold
  - `maxDominancePct` (theme shouldn’t exceed X% of inbox)
- Should drift control happen in pipeline (theme labeling) or only in UI grouping?

If unclear, stop and ask the driver.

## Implementation steps (ordered)

1. Add new fields to `theme_tuning_v1` and admin tuning UI.
2. Enforce lifecycle rules when clustering theme labels in the digest pipeline.
3. Add a drift indicator (optional) or automatic split behavior.
4. Update docs to reflect lifecycle controls and expected behavior.

## Acceptance criteria

- [ ] Themes stop growing beyond configured caps.
- [ ] Themes expire or split when cohesion drops.
- [ ] Defaults keep grouping stable for average users.
- [ ] Docs updated.

## Test plan (copy/paste commands)

```bash
pnpm -C packages/shared typecheck
pnpm -C packages/pipeline typecheck
pnpm -C packages/web typecheck
```

## Commit

- **Message**: `feat(themes): add lifecycle controls`
- **Files expected**:
  - `packages/shared/src/types/theme_tuning.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/web/src/app/app/admin/tuning/page.tsx`
  - `docs/pipeline.md`
