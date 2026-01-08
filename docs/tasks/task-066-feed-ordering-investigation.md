# Task 066: Feed Ordering Investigation

## Status: Open
## Priority: High

## Problem
User reports seeing unexpected ordering in Feed:
- "I only see one X post and then I see reddit and HN"
- Expected: items sorted by score with LLM triage (aha_score) factored in

## Investigation Findings

### API Data (as of 2026-01-08)
Feed source distribution:
- HN: 30 items
- X posts: 10 items
- Reddit: 10 items

X posts scores (from API): 0.317, 0.278, 0.277, 0.249, 0.249...
HN posts scores (from API): 0.189, 0.170, 0.149...

**X posts have HIGHER scores than HN but may be appearing later in UI.**

### Possible Causes
1. **Frontend re-sorting issue** - Check if Feed page is modifying order
2. **Caching** - Browser may have stale data
3. **Score decay mismatch** - API applies decay, frontend may re-sort incorrectly
4. **Filtering** - Source type filter may be active

### Files to Investigate
- `packages/web/src/app/app/feed/page.tsx` - sorting/filtering logic
- `packages/api/src/routes/items.ts` - API ordering
- `packages/pipeline/src/stages/rank.ts` - how scores are computed

## Action Items
1. Add console logging to Feed to trace item ordering
2. Check if there's any frontend sorting overriding API order
3. Verify decay is applied consistently
4. Test with fresh browser session (no cache)
