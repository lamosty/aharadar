# Task 111 — `refactor(pipeline,web): de-prioritize/disable signal features (MVP)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Since we are not using the “signal” concept right now, make the product behave as if signal is **disabled** by default:

- no signal connector emphasis in the UI
- no signal corroboration scoring / WhyShown sections
- keep the codebase provider-agnostic and easy to re-enable later

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md` (signal vs canonical semantics)
- `packages/pipeline/src/stages/digest.ts` (signal corroboration)
- `packages/pipeline/src/stages/rank.ts` (wSignal)
- `packages/web/src/components/WhyShown/WhyShown.tsx`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx` (source types UI)

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/rank.ts`
- `packages/web/src/components/WhyShown/**`
- `packages/web/src/components/SourceConfigForms/**`
- (optional) `docs/connectors.md` (only if behavior is documented)

If anything else seems required, **stop and ask**.

## Decisions

Already decided (driver):

- Treat “signal” as not used for now; focus on canonical sources (including `x_posts`).

## Implementation steps (ordered)

1. Gate signal corroboration behind a config flag (default OFF), e.g. `ENABLE_SIGNAL_CORROBORATION=0`:
   - skip the DB query for signal bundles when disabled
   - ensure `triage_json.system_features.signal_corroboration_v1` is absent when disabled
2. Default `wSignal = 0` when corroboration is disabled (avoid confusion).
3. Update WhyShown UI:
   - hide/remove the corroboration section when the feature is absent
4. Update source picker / admin source UI:
   - optionally hide `signal` type from the main picker (or move to “advanced/experimental”).
5. Confirm no regressions:
   - digests still generate and WhyShown works
   - no signal-specific errors when signal is unused

## Acceptance criteria

- [ ] With default config, no signal corroboration is computed or displayed.
- [ ] Pipeline does not query signal bundles when signal corroboration is disabled.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
```

## Commit

- **Message**: `refactor(signal): disable signal corroboration by default`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/web/src/components/WhyShown/**`
  - (optional) `packages/web/src/components/SourceConfigForms/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
