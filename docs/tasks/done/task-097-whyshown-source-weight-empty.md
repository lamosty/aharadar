# Task 097: Fix empty Source Weight in WhyShown panel

## Problem

In the WhyShown panel on the Feed page, the "Source Weight" section shows an empty definition - no data is displayed even though source weight is being applied to ranking.

## Location

- `packages/web/src/components/WhyShown/WhyShown.tsx`
- May also need to check API response in `packages/api/src/routes/items.ts`

## Current Behavior

When expanding "Why shown" on a feed item:

- AI Score: Shows score and reason
- Novelty: Shows score and lookback
- Freshness: Shows score and age
- Source Weight: **Empty** (no content)
- Your Preferences: Shows source type and author
- Categories: Shows category tags

## Expected Behavior

Source Weight should display:

- Source type weight (e.g., "x_posts: 1.2")
- Individual source weight (e.g., "1.0")
- Effective combined weight

## Investigation

1. Check if `system_features.source_weight_v1` is present in triage_json
2. Check if WhyShown component handles this field
3. Verify API returns source weight data

## Acceptance Criteria

- [ ] Source Weight displays source type and weight values
- [ ] Matches the actual weight applied in ranking
- [ ] `pnpm typecheck` passes

## Priority

Low - informational only, doesn't affect functionality
