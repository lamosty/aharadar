# Task Report: feat(web): show X account health + controls

## Summary

Implemented X account health UI in EditSourceModal:

1. **API Client** - Added types and functions for X account policy endpoints
2. **React Query Hooks** - Query for policies, mutations for mode update and reset
3. **XAccountHealth Component** - Displays per-account policy state in X source config
4. **Localized Strings** - All UI text added to en.json

## Files Changed

- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/components/EditSourceModal/EditSourceModal.tsx`
- `packages/web/src/components/EditSourceModal/XAccountHealth.tsx`
- `packages/web/src/components/EditSourceModal/XAccountHealth.module.css`
- `packages/web/src/messages/en.json`

## Features

- Shows list of X accounts with health status (Normal/Reduced/Muted)
- Mode selector: Auto / Always fetch / Mute
- Stats display: Score, Sample size, Fetch rate
- Next feedback effects preview
- Reset stats button

## Deferred

Feed item integration (WhyShown) requires backend changes to include policy data in items endpoint response.

## Commits

1. `0d0e467` feat(x_posts): add account policy gating + admin API
2. `b4f164f` feat(web): show X account health + controls

## Test Results

- TypeScript strict check passes
- All unit tests pass (23 policy math tests)
