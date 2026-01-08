# Task 069: WhyShown Shows Nothing When Expanded

## Priority: High

## Problem
When expanding "Why shown" under a feed item, nothing displays. The component appears empty.

## Investigation Needed
1. Check if triage_json is being passed correctly from API
2. Verify WhyShown component handles the data structure
3. Check if there's a conditional that hides content

## Files to Check
- `/packages/web/src/components/WhyShown/WhyShown.tsx`
- `/packages/api/src/routes/items.ts` - verify triage_json is returned
- `/packages/web/src/components/Feed/FeedItem.tsx` - how it passes data to WhyShown

## Acceptance Criteria
- WhyShown displays aha_score, reason, and feature breakdown when expanded
- Works for both LLM-triaged and heuristic-only items
