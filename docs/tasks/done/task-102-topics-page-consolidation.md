# Task 102: Consolidate Topics Management to Dedicated Page

## Priority: High

## Goal

Move all topic management functionality to the dedicated Topics page (`/app/topics`) and remove it from the Settings page. Sources should also be managed within topics, not as a separate section.

## Background

Currently the app has fragmented topic/source management:

- Settings page (`/app/settings`) has a Topics section for viewing profile settings per topic
- Topics page (`/app/topics`) exists but is underutilized
- Admin sources page (`/app/admin/sources`) manages sources globally
- User sources page (`/app/sources`) also exists

This is confusing because:

- Sources should be added **per topic**, not globally
- Topic management is split across multiple pages
- Mental model is unclear: "Where do I add a source?"

## Requirements

### Phase 1: Consolidate Topics Page

1. Move topic CRUD (create, update, delete) to `/app/topics`
2. Remove Topics section from Settings page
3. Each topic card should show:
   - Topic name + description (editable)
   - Viewing profile settings (decay, etc.)
   - List of sources assigned to this topic
   - "Add source" button within the topic

### Phase 2: Remove Redundant Pages

1. Remove `/app/admin/sources` page (or repurpose for admin-only global source management)
2. Remove `/app/sources` page if it exists
3. Update navigation to remove Sources links

### Phase 3: Source Management Within Topics

1. Each topic has its own sources list
2. "Add Source" modal/form within topic card
3. Edit/delete source actions inline
4. Source configuration (cadence, weight) editable per source

## Current Pages to Modify

- `packages/web/src/app/app/topics/page.tsx` - Enhance with full CRUD + sources
- `packages/web/src/app/app/settings/page.tsx` - Remove Topics section
- `packages/web/src/app/app/admin/sources/page.tsx` - Remove or repurpose
- `packages/web/src/app/app/sources/page.tsx` - Remove if exists
- Navigation components - Update menu items

## Wireframe: New Topics Page

```
Topics
─────────────────────────────────────────────

[+ Create Topic]

┌─────────────────────────────────────────────┐
│ General                              [Edit] │
│ Your main content feed                      │
│                                             │
│ Viewing Profile: Daily (24h decay)          │
│ Last caught up: 2h ago                      │
│                                             │
│ Sources (3):                                │
│ ├─ [HN] Hacker News - every 30min          │
│ ├─ [Reddit] r/programming - every 1h       │
│ └─ [RSS] TechCrunch - every 2h             │
│                                             │
│ [+ Add Source]                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Finance                              [Edit] │
│ Market news and analysis                    │
│ ...                                         │
└─────────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Topics page has full CRUD for topics
- [ ] Each topic shows its sources inline
- [ ] Sources can be added/edited/deleted within topic
- [ ] Settings page no longer has Topics section
- [ ] Admin sources page removed or admin-only
- [ ] Navigation updated
- [ ] `pnpm typecheck` passes

## Notes

- This is a UX simplification, not a feature change
- Backend API should already support source-per-topic operations
- Consider adding drag-and-drop to reorder sources within a topic
