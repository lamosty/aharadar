# Task 101: Rename Default Topic to "General"

## Priority: Medium

## Goal

Rename the hardcoded "default" topic name to "General" (or a more user-friendly name) so it doesn't look like a system setting.

## Background

The default topic is currently named "default" (lowercase), which:
- Looks like a system/internal setting rather than a user-facing topic name
- Is not user-friendly for new users
- Doesn't follow capitalization conventions (other topics would be "Tech News", "Finance", etc.)

## Current State

The "default" name is referenced in several places:

```
packages/api/src/lib/db.ts:26:  const defaultTopic = topics.find((t) => t.name === "default") ?? topics[0];
packages/api/src/routes/topics.ts:633:    if (existing.name === "default") {
packages/web/src/components/TopicProvider/TopicProvider.tsx:78:      const defaultTopic = topics.find((t) => t.name === "default") || topics[0];
```

## Requirements

1. Create a DB migration to rename existing "default" topics to "General"
2. Update code references to use "General" instead of "default"
3. Alternatively: Remove the special-casing and just use the first topic as default
4. Allow users to rename the default topic (currently prevented)

## Implementation Options

### Option A: Migration + Code Update
- Write migration: `UPDATE topics SET name = 'General' WHERE name = 'default'`
- Update code references from "default" to "General"

### Option B: Remove Special Default Name
- Remove the check for `name === "default"` in topics.ts (allow deletion)
- Use first topic as fallback instead of name-based lookup
- Let users rename any topic including the first one

## Files to Modify

- `packages/db/migrations/` - New migration file
- `packages/api/src/lib/db.ts` - Update default topic lookup
- `packages/api/src/routes/topics.ts` - Update or remove "default" check
- `packages/web/src/components/TopicProvider/TopicProvider.tsx` - Update fallback logic

## Acceptance Criteria

- [ ] No topics named "default" in the database
- [ ] Default topic shows as "General" (or user-chosen name)
- [ ] Users can rename any topic
- [ ] `pnpm typecheck` passes
- [ ] Existing functionality preserved

## Notes

- Consider Option B as it's cleaner and removes arbitrary restrictions
- The name "General" is just a suggestion - could also be "Main", "Primary", or user's first topic name
