# Task 096: Fix tooltip z-index on Feed page

## Problem

On the Feed page, when hovering over:

- The AHA score badge
- The source type logo/icon

The tooltip/popover is hidden behind the background. The z-index is incorrect, causing the tooltip to render behind other elements.

## Location

Likely in one of these files:

- `packages/web/src/components/Feed/FeedItem.module.css`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/styles/globals.css` (tooltip styles)

## Expected Behavior

Tooltips should appear above all other content when triggered by hover.

## Solution

1. Find the tooltip component/styles used for score and source badges
2. Ensure tooltip has `z-index` high enough (e.g., `z-index: 100` or higher)
3. Ensure parent containers don't have `overflow: hidden` or stacking context issues

## Acceptance Criteria

- [ ] Score tooltip visible when hovering over AHA score
- [ ] Source type tooltip visible when hovering over source icon
- [ ] Tooltips don't get clipped by article boundaries
- [ ] No visual regressions

## Priority

Medium - affects UX but doesn't break functionality
