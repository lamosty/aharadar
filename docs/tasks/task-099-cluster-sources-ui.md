# Task 099: Show Cluster Sources in Feed UI

## Priority: High

## Goal

When a feed item represents a cluster of similar items from multiple sources, show:
1. A "+N sources" badge on the card with tooltip explanation
2. Full list of related sources in the WhyShown panel

## Background

Currently, when multiple items are clustered together (e.g., same news from HN, Reddit, RSS), only one "representative" is shown. Users have no visibility into other sources covering the same topic.

## Requirements

### 1. API Changes (`packages/api/src/routes/items.ts`)

Extend FeedItem response to include:
```typescript
clusterId?: string | null;
clusterMemberCount?: number;  // Total items in cluster (including representative)
clusterItems?: Array<{
  id: string;
  title: string | null;
  url: string | null;
  sourceType: string;
  author: string | null;
  similarity: number;
}>;
```

### 2. Feed Card Badge

On cards with `clusterMemberCount > 1`, show badge:
- Text: "+N sources" (where N = clusterMemberCount - 1)
- Position: In header, near source tag
- Tooltip on hover: "This topic has coverage from N sources. Expand 'Why shown' to see all."

### 3. WhyShown Panel Extension

Add "Related Sources" section when cluster data exists:
```
📚 Related Sources (N total)
├─ [HN] Title of HN post (94% similar)
├─ [Reddit] Title of Reddit post (91% similar)
└─ [RSS] Title of RSS article (87% similar)
```

Each item should:
- Show source type badge
- Show title (or "(Untitled)" if null)
- Show similarity percentage
- Be clickable link to the URL

## Files to Modify

- `packages/api/src/routes/items.ts` - SQL query + response mapping
- `packages/web/src/lib/api.ts` - FeedItem type
- `packages/web/src/components/Feed/FeedItem.tsx` - Badge + tooltip
- `packages/web/src/components/Feed/FeedItem.module.css` - Badge styles
- `packages/web/src/components/WhyShown/WhyShown.tsx` - Cluster section
- `packages/web/src/components/WhyShown/WhyShown.module.css` - Cluster styles
- `packages/web/src/lib/i18n.ts` - Translation keys

## Acceptance Criteria

- [ ] API returns cluster data with feed items
- [ ] Badge shows "+N sources" on clustered items
- [ ] Tooltip explains what the badge means
- [ ] WhyShown shows all cluster items with similarity scores
- [ ] Non-clustered items unaffected (no badge, no section)
- [ ] `pnpm typecheck` passes
