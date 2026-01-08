# Task 051: Reddit Subreddit Display and Filtering

## Problem

Reddit posts don't show which subreddit they're from, making it hard to scan and filter the feed. Users following multiple subreddits (e.g., r/bitcoin, r/wallstreetbets, r/investing) can't distinguish sources at a glance.

## Current State

### Database
Reddit `metadata_json` contains subreddit info:
```json
{
  "subreddit": "Bitcoin",
  "subreddit_id": "t5_2s3qj",
  "permalink": "https://www.reddit.com/r/Bitcoin/comments/...",
  "ups": 43,
  "score": 43,
  "num_comments": 14,
  "upvote_ratio": 0.87
}
```

### API
- `metadata_json` is NOT returned by items API
- Feed items only have `sourceType: "reddit"`, no subreddit info

### FeedItem Component
- Shows "Reddit" badge, no subreddit distinction

## Solution

### 1. Include metadata in API response

**File:** `packages/api/src/routes/items.ts`

Add `metadata_json` to the query:
```sql
SELECT
  ...
  ci.metadata_json,
  ...
```

Or extract specific fields:
```sql
SELECT
  ...
  ci.metadata_json->>'subreddit' as subreddit,
  (ci.metadata_json->>'ups')::int as upvotes,
  (ci.metadata_json->>'num_comments')::int as comment_count,
  ...
```

Update response:
```typescript
item: {
  ...
  metadata: {
    subreddit: row.subreddit,  // For Reddit
    upvotes: row.upvotes,
    commentCount: row.comment_count,
  }
}
```

### 2. Update FeedItem display

**File:** `packages/web/src/components/Feed/FeedItem.tsx`

For Reddit items, show subreddit:
```tsx
{item.item.sourceType === 'reddit' && item.item.metadata?.subreddit && (
  <span className={styles.subreddit}>
    r/{item.item.metadata.subreddit}
  </span>
)}
```

Could also show:
- Upvotes count
- Comment count
- Upvote ratio as quality indicator

### 3. Add subreddit filter to feed

**File:** `packages/web/src/app/app/feed/page.tsx`

When sourceTypes includes "reddit", show subreddit filter dropdown:
```tsx
{activeSourceTypes.includes('reddit') && (
  <select
    value={selectedSubreddit}
    onChange={(e) => setSelectedSubreddit(e.target.value)}
  >
    <option value="">All subreddits</option>
    {subreddits.map(sub => (
      <option key={sub} value={sub}>r/{sub}</option>
    ))}
  </select>
)}
```

**File:** `packages/api/src/routes/items.ts`

Add subreddit filter:
```typescript
if (subreddit) {
  filterConditions.push(`ci.metadata_json->>'subreddit' = $${filterParamIdx}`);
  filterParams.push(subreddit);
  filterParamIdx++;
}
```

### 4. Update API types

**File:** `packages/web/src/lib/api.ts`

```typescript
interface FeedItemContent {
  title: string | null;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceId: string;
  metadata?: {
    // Reddit
    subreddit?: string;
    upvotes?: number;
    commentCount?: number;
    upvoteRatio?: number;
    // X
    fullName?: string;
    // etc.
  };
}
```

## Visual Design

### Reddit Feed Item
```
┌─────────────────────────────────────────────────────────────┐
│ Reddit  r/Bitcoin  @user123  2h ago                    [87] │
│                                                             │
│ The BTC guitar is very versatile 🤘😎                       │
│                                                             │
│ 👍 43  💬 14                                                │
│ 👍 👎 🔖 ⏭  │  WHY SHOWN ▼                                   │
└─────────────────────────────────────────────────────────────┘
```

## Testing

1. Verify subreddit shows for Reddit items
2. Verify upvotes/comments show (optional)
3. Verify filter by subreddit works
4. Verify non-Reddit items unaffected

## Files to Modify

- `packages/api/src/routes/items.ts` - Add metadata to query/response, add filter
- `packages/web/src/lib/api.ts` - Update types
- `packages/web/src/components/Feed/FeedItem.tsx` - Display subreddit
- `packages/web/src/components/Feed/FeedItem.module.css` - Styling
- `packages/web/src/app/app/feed/page.tsx` - Subreddit filter (optional)

## Priority

**Medium** - Improves UX for multi-subreddit sources, helps distinguish content.
