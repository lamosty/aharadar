# Task 070: Add HN Comments Link to Feed Items

## Priority: Medium

## Problem
Hacker News posts often have more valuable discussion in the comments than in the linked article itself. Currently, users can only click through to the original article.

## Solution
Add a "Comments" link to FeedItem cards for HN source type that links to the HN discussion page.

## Implementation
1. HN items have `external_id` which is the HN item ID
2. Comments URL: `https://news.ycombinator.com/item?id={external_id}`
3. Add a comments icon/link in the FeedItem footer for `source_type === 'hn'`

## Files to Modify
- `/packages/web/src/components/Feed/FeedItem.tsx`
- `/packages/web/src/components/Feed/FeedItem.module.css`

## Design Considerations
- Small "💬 Comments" or chat icon next to existing metadata
- Only show for HN items
- Opens in new tab

## Acceptance Criteria
- HN feed items show a comments link
- Link goes to `https://news.ycombinator.com/item?id={id}`
- Non-HN items don't show this link
