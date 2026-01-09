# Task 048: Fix X Posts Feed Display

## Problem

X (Twitter) posts show "(Untitled)" in the feed because they have `body_text` instead of `title`. The current implementation:

1. API doesn't return `body_text` for feed items
2. FeedItem component only displays `title`, falling back to "(Untitled)"

## Current State

### API (`packages/api/src/routes/items.ts`)

- Returns `ci.title` but NOT `ci.body_text`
- X posts have `title = NULL` and meaningful content in `body_text`

### FeedItem Component (`packages/web/src/components/Feed/FeedItem.tsx`)

```tsx
// Line 91-95
{
  item.item.title || "(Untitled)";
}
```

### Database

```sql
SELECT title, body_text FROM content_items WHERE source_type = 'x_posts' LIMIT 1;
-- title: NULL
-- body_text: "Nvidia just announced its product lines..."
```

## Solution

### 1. Update API to return body_text

**File:** `packages/api/src/routes/items.ts`

Add `body_text` to the query and response:

```sql
SELECT
  ...
  ci.body_text,
  ...
```

Update `UnifiedItemRow` interface to include `body_text: string | null`.

Update response mapping:

```typescript
item: {
  title: row.title,
  bodyText: row.body_text,  // ADD THIS
  url: row.canonical_url,
  ...
}
```

### 2. Update API types

**File:** `packages/web/src/lib/api.ts`

Add to `FeedItem.item`:

```typescript
interface FeedItemContent {
  title: string | null;
  bodyText: string | null;  // ADD THIS
  url: string | null;
  ...
}
```

### 3. Update FeedItem component

**File:** `packages/web/src/components/Feed/FeedItem.tsx`

Change display logic:

```tsx
// Get display text: prefer title, fall back to truncated body_text, then "(Untitled)"
const displayTitle =
  item.item.title || (item.item.bodyText ? truncate(item.item.bodyText, 200) : null) || "(Untitled)";

// For X posts specifically, might want different layout:
// - Show author more prominently
// - Show body_text as main content (like Twitter)
// - Smaller/different styling

{
  item.item.sourceType === "x_posts" ? (
    <div className={styles.tweetContent}>
      <p className={styles.tweetBody}>{item.item.bodyText}</p>
    </div>
  ) : (
    <h3 className={styles.title}>
      <a href={item.item.url}>{displayTitle}</a>
    </h3>
  );
}
```

### 4. Add styles for X posts

**File:** `packages/web/src/components/Feed/FeedItem.module.css`

Add Twitter-like styling:

```css
.tweetContent {
  /* Tweet body styling */
}

.tweetBody {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--color-text-primary);
  /* Maybe limit to 3-4 lines with ellipsis */
}
```

## Testing

1. Verify X posts show body_text instead of "(Untitled)"
2. Verify HN/Reddit/RSS items still show title correctly
3. Verify truncation works for long body_text
4. Check mobile responsiveness

## Files to Modify

- `packages/api/src/routes/items.ts` - Add body_text to query and response
- `packages/web/src/lib/api.ts` - Add bodyText to FeedItem type
- `packages/web/src/components/Feed/FeedItem.tsx` - Display logic
- `packages/web/src/components/Feed/FeedItem.module.css` - Styling

## Priority

**High** - Users currently see useless "(Untitled)" for all X posts, making the feed unusable for Twitter content.
