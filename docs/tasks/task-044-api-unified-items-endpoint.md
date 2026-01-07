# Task 044 — `feat(api): unified items endpoint with filters`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Create a new API endpoint `GET /api/items` that returns ALL ranked items across all digests, with filtering and sorting capabilities. This is the foundation for a unified feed UX instead of digest-by-digest navigation.

## Background

Currently users navigate digest-by-digest. The product vision is a unified "radar" showing all interesting/novel items ranked together, filterable by source, date, etc.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/spec.md`
- `docs/data-model.md`

## Scope (allowed files)

- `packages/api/src/routes/items.ts`
- `packages/db/src/repos/` (if new repo methods needed)
- Related types in `packages/shared`

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. **Design the endpoint**:

   ```
   GET /api/items
   Query params:
   - limit (default 50, max 200)
   - offset (for pagination)
   - sourceTypes[] (filter: hn, reddit, x_posts, etc.)
   - sourceIds[] (filter: specific source UUIDs)
   - minScore (filter: only items with score >= N)
   - since (ISO date: only items newer than)
   - until (ISO date: only items older than)
   - sort (score_desc [default], date_desc, date_asc)
   ```

2. **Query logic**:
   - Join `digest_items` with `content_items`
   - If an item appears in multiple digests, use the LATEST score
   - Apply filters
   - Return item with score, source info, metadata

3. **Response shape**:

   ```typescript
   {
     ok: true,
     items: [{
       id: string,
       score: number,
       rank: number, // within returned set
       digestId: string,
       digestCreatedAt: string,
       item: {
         title, url, author, publishedAt, sourceType, sourceId
       },
       triageJson?: {...},
       feedback?: "like" | "dislike" | "save" | "skip" | null
     }],
     pagination: {
       total: number,
       limit: number,
       offset: number,
       hasMore: boolean
     }
   }
   ```

4. **Include user feedback state**:
   - Join with `feedback_events` to show if user already reacted to each item

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Endpoint returns items from multiple digests, sorted by score
- [ ] All filters work correctly
- [ ] Pagination works
- [ ] Performance is acceptable (< 500ms for typical query)

## Test plan (copy/paste)

```bash
# Start services
pnpm dev:services
pnpm build
pnpm dev:api

# Test basic call
curl -H "X-API-Key: $ADMIN_API_KEY" "http://localhost:3001/api/items?limit=10"

# Test with filters
curl -H "X-API-Key: $ADMIN_API_KEY" "http://localhost:3001/api/items?sourceTypes=hn,reddit&minScore=0.3"

# Test pagination
curl -H "X-API-Key: $ADMIN_API_KEY" "http://localhost:3001/api/items?limit=10&offset=10"
```

## Notes

- This is foundational for tasks 045-047
- Consider adding an index on `digest_items(score DESC)` if query is slow
- Don't remove existing `/digests` endpoints yet - they may still be useful
