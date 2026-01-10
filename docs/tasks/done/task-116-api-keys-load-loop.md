# Task 116: Fix API Keys settings load loop

## Priority: High

## Goal

Prevent continuous re-fetching in the API Keys settings view.

## Problem

`ApiKeysSettings` calls `loadKeys()` in a `useEffect` that depends on a non-memoized function, which causes the effect to run on every render (repeat API calls, UI flicker).

## Requirements

1. **Stabilize `loadKeys`** using `useCallback`, or move the function outside the component.
2. `useEffect` should run **once on mount** and again only when explicitly needed.
3. Keep behavior unchanged otherwise (fetch keys + status; update UI).

## Files to Modify

- `packages/web/src/components/ApiKeysSettings/ApiKeysSettings.tsx`

## Acceptance Criteria

- API keys are fetched once on mount (no loop).
- Saving or deleting a key refreshes the list once.
- No additional UI regressions.
