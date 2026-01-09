# Task 052: X Posts User Display Enhancement

## Problem

X (Twitter) posts only show the handle (e.g., "@aravind") but not the user's full display name (e.g., "Aravind Srinivas"). This makes it harder to identify who posted.

## Current State

### Database

```sql
SELECT author, metadata_json FROM content_items WHERE source_type = 'x_posts' LIMIT 1;
```

```
author: "@aravind"
metadata_json: {
  "query": "from:aravind -filter:replies -filter:retweets",
  "vendor": "grok",
  "post_url": "https://x.com/aravind/status/...",
  "post_date": "2026-01-06",
  ...
}
```

**Full name is NOT stored** - only the handle.

### API/UI

- Shows `@aravind` as author
- No display name available

## Investigation Needed

### 1. Check X connector normalization

**File:** `packages/connectors/src/x_posts/normalize.ts`

Does the Grok API return display name? Check:

- What fields come back from Grok search
- Is display name available but not being stored?

### 2. Check raw fetch data

**File:** `packages/connectors/src/x_posts/fetch.ts`

What does the raw API response include?

## Potential Solutions

### Option A: Store display name during ingestion (Recommended)

If Grok API returns display name:

**File:** `packages/connectors/src/x_posts/normalize.ts`

```typescript
return {
  ...
  author: `@${post.username}`,  // Current
  metadata: {
    ...existing,
    display_name: post.name || post.display_name,  // ADD THIS
    verified: post.verified,
    followers_count: post.followers_count,
  }
}
```

Then update API/UI to show `metadata.display_name` if available.

### Option B: Fetch user info separately

If Grok doesn't return display name, could make separate API call:

- Not recommended - adds complexity and API costs
- Could do batch lookup for top authors

### Option C: Display enhancement without data change

If we can't get display name, improve current display:

- Make handle more prominent
- Add link to profile
- Show avatar if available

## Implementation (assuming Option A works)

### 1. Update X connector normalize

**File:** `packages/connectors/src/x_posts/normalize.ts`

Add display_name to metadata_json.

### 2. Re-run pipeline for X sources

```bash
pnpm dev:cli -- admin:run-now --source-type x_posts
```

Existing items won't have display_name; only new fetches will.

### 3. Update API response

**File:** `packages/api/src/routes/items.ts`

```sql
SELECT
  ...
  ci.metadata_json->>'display_name' as display_name,
  ...
```

### 4. Update FeedItem display

**File:** `packages/web/src/components/Feed/FeedItem.tsx`

```tsx
{
  item.item.sourceType === "x_posts" && (
    <span className={styles.xAuthor}>
      {item.item.metadata?.displayName && (
        <span className={styles.displayName}>{item.item.metadata.displayName}</span>
      )}
      <span className={styles.handle}>{item.item.author}</span>
    </span>
  );
}
```

### 5. Styling

**File:** `packages/web/src/components/Feed/FeedItem.module.css`

```css
.xAuthor {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.displayName {
  font-weight: 600;
  color: var(--color-text-primary);
}

.handle {
  color: var(--color-text-tertiary);
}
```

## Visual Design

### Current

```
x  @aravind  (Untitled)
```

### After Fix

```
x  Aravind Srinivas @aravind
   His name says he's of Italian descent...
```

## Investigation First

Before implementing, verify:

1. Does Grok API return display name?
2. If not, what alternatives exist?

Check:

- `packages/connectors/src/x_posts/fetch.ts`
- Grok API documentation
- Sample raw response from Grok

## Files to Potentially Modify

- `packages/connectors/src/x_posts/normalize.ts`
- `packages/api/src/routes/items.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css`

## Priority

**Low-Medium** - Nice to have, but handle is functional. Higher priority is fixing body_text display (Task 048).
