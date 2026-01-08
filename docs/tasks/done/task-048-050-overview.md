# Tasks 048-053 Overview: Topics & Feed Polish

## Context

Session on 2026-01-07 implemented:
1. Topics viewing profile at DB/API level (migration, routes)
2. Settings page with per-topic viewing profile UI
3. Cluster support in items API

However, several issues remain:

## Issues Identified

### 1. X Posts Show "(Untitled)" in Feed
- **Impact:** High - Feed is unusable for Twitter content
- **Root cause:** API doesn't return `body_text`, FeedItem only shows `title`
- **Task:** 048

### 2. Topics Settings UI Looks Broken
- **Impact:** Medium - Functional but confusing
- **Root cause:** CSS grid layout doesn't work well, options flow incorrectly
- **Task:** 049

### 3. No Topic Management UI
- **Impact:** High - Core feature missing
- **Root cause:** Only backend was implemented, no UI for creating/switching topics
- **Task:** 050

## Task Breakdown

| Task | Description | Priority | Effort |
|------|-------------|----------|--------|
| **048** | Fix X posts feed display (show body_text) | High | Small |
| **049** | Fix topics settings UI layout | Medium | Small |
| **050** | Full topic management system | High | Large |
| **051** | Reddit subreddit display and filtering | Medium | Small |
| **052** | X posts user display name | Low | Small |
| **053** | Fix "Why shown" missing features | Medium | Medium |

## Recommended Order

1. **048** - Quick win, fixes major UX issue (X posts show "(Untitled)")
2. **049** - Quick fix, improves settings page visual
3. **051** - Quick win, shows subreddit for Reddit posts
4. **053** - Fix env config + re-run pipeline for triage data
5. **050 Phase 1-2** - API endpoints + Topic switcher component
6. **050 Phase 3-4** - Topic context + Feed integration
7. **050 Phase 5-6** - Settings management + Sources integration
8. **052** - X display names (needs investigation of Grok API)

## Definition of Done

### Task 048
- [ ] X posts show body_text instead of "(Untitled)"
- [ ] Truncation works for long text
- [ ] Other source types unaffected

### Task 049
- [ ] Profile options display in clear list/grid
- [ ] Selected state is obvious
- [ ] Expand/collapse works smoothly
- [ ] Responsive on mobile

### Task 050
- [ ] Can create new topics
- [ ] Can delete topics (except default)
- [ ] Topic switcher in feed header
- [ ] Feed shows only items from selected topic
- [ ] Sources can be assigned to topics
- [ ] Viewing profile persists per topic

### Task 051
- [ ] Reddit posts show subreddit (r/bitcoin, r/wallstreetbets)
- [ ] Optional: upvotes/comment count display
- [ ] Optional: filter by subreddit

### Task 052
- [ ] X posts show display name if available
- [ ] Falls back to handle if no display name

### Task 053
- [ ] Investigate why triage_json is NULL (check provider_calls table)
- [ ] Re-run pipeline with triage enabled
- [ ] "Why shown" displays ranking features

## Related Files Quick Reference

### API
- `packages/api/src/routes/items.ts` - Feed items query
- `packages/api/src/routes/topics.ts` - Topics CRUD

### Web - Components
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/TopicViewingProfile/`

### Web - Pages
- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/app/app/settings/page.tsx`
- `packages/web/src/app/app/sources/page.tsx`

### Database
- `packages/db/src/repos/topics.ts`
- `packages/db/migrations/0006_topics_viewing_profile.sql`

## Commits from Previous Session

```
ded2e5b feat(api): support cluster-based digest items in feed
206d3e7 feat(web): add per-topic viewing profile settings UI
24f4a15 feat(api): add topics API routes for viewing profile
aa73efa feat(db): add viewing profile columns to topics table
```
