# Task 065: Topics Navigation Redesign

## Status: Open

## Priority: High

## Problem

The Topics link in sidebar currently redirects to Settings page which is confusing. Users with multiple topics need a dedicated way to:

1. See all their topics
2. Click into a topic to see its sources and items
3. Manage topic-specific content

## Current Behavior

- Topics link in sidebar → goes to `/app/settings` (same as Settings)
- Feed shows items from all topics mixed together (filtered by topicId in URL)
- TopicSwitcher dropdown exists but doesn't provide good UX for topic management

## Proposed Changes

### Option A: Dedicated Topics Page

1. Create `/app/topics` page listing all topics
2. Each topic card shows: name, description, source count, item count
3. Clicking topic goes to `/app/topics/:id` showing that topic's feed
4. Keep Feed as "All Items" view across topics

### Option B: Topics as Primary Navigation

1. Rename "Feed" to "All Items" or "Everything"
2. Make Topics primary navigation
3. Clicking topic shows its dedicated feed with sources sidebar
4. Settings only for account/preferences

## Implementation Notes

- Files to modify:
  - `packages/web/src/components/AppShell/nav-model.ts` - nav structure
  - `packages/web/src/app/app/topics/` - new topic pages
  - `packages/web/src/components/TopicSwitcher/` - potentially enhance or replace

## Questions to Resolve

- Should Topics be above or below Feed in sidebar?
- Should we show topic-specific views inline or as separate pages?
- How to handle users with only one topic?
