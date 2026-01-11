# Digests Page Redesign

## Overview

Transform the digests page from a simple list into an analytics dashboard + digest browser. Adds topic filtering, date range selection, and key metrics visibility.

## Problem

- Digests page is hardcoded to first topic via `getSingletonContext()`
- No visibility into digest trends, quality, or costs
- Users with multiple topics can't browse digests across topics

## Design

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Digests                    [All Topics ▼]  [Last 7 days ▼]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │   Volume    │ │   Quality   │ │    Cost     │             │
│ │  1,234 items│ │  0.45 avg   │ │  $2.34      │             │
│ │  +12% ↑     │ │  +5% ↑      │ │  -8% ↓      │             │
│ └─────────────┘ └─────────────┘ └─────────────┘             │
├─────────────────────────────────────────────────────────────┤
│ Status │ Topic │ Window │ Mode │ Items │ Score │ Credits   │
│ ✓      │ Tech  │ Jan 11 │ High │ 87    │ 0.52  │ 0.15      │
│ ✓      │ Tech  │ Jan 11 │ Norm │ 45    │ 0.48  │ 0.08      │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Header Bar

- Title "Digests" on the left
- Topic toggle: "All Topics" | specific topic dropdown
- Date range picker: presets (7d, 30d, 90d, This month, Last month) + custom range

**URL state:** `/app/digests?topic=abc&from=2026-01-01&to=2026-01-11`

**Defaults:** All topics, last 7 days

### Analytics Cards

Three equal-width cards, responsive (stack on mobile):

**1. Volume Card**
- Primary: Total items processed
- Secondary: Digest count, avg items/digest
- Trend: % change vs previous period

**2. Quality Card**
- Primary: Average top-10 score
- Secondary: Triage breakdown donut (high/medium/low/skip %)
- Trend: Score change vs previous period

**3. Cost Card**
- Primary: Total credits used
- Secondary: Avg credits/digest, by-mode breakdown
- Trend: Cost change vs previous period

### Digest List

Enhanced condensed table:

| Column | Description | Notes |
|--------|-------------|-------|
| Status | Check/X icon | Existing |
| Topic | Topic name badge | Hidden when single topic selected |
| Window | Time range link | Links to digest detail |
| Mode | Low/Normal/High badge | Existing |
| Items | Item count | Existing |
| Top Score | Highest item score | New |
| Credits | Credits used | New |
| Created | Relative time | Existing |

**Pagination:** 25 per page, prev/next controls

### Empty States

- No digests in range: "No digests found for this period. Try adjusting the date range."
- No digests ever: Existing empty state with create prompt

## API Changes

### GET /digests (modified)

Add parameters:
- `topic` (optional) - UUID, when omitted returns all topics
- Keep `from`, `to` for date range

Response changes per digest:
- Add `topicId: string`
- Add `topicName: string`
- Add `topScore: number` (highest scoring item)
- Ensure `creditsUsed` is included

### GET /digests/stats (new)

Parameters:
- `topic` (optional) - UUID
- `from` (required) - ISO date
- `to` (required) - ISO date

Response:
```typescript
{
  ok: true,
  stats: {
    // Volume
    totalItems: number,
    digestCount: number,
    avgItemsPerDigest: number,

    // Quality
    avgTopScore: number,
    triageBreakdown: {
      high: number,    // percentage
      medium: number,
      low: number,
      skip: number
    },

    // Cost
    totalCredits: number,
    avgCreditsPerDigest: number,
    creditsByMode: {
      low: number,
      normal: number,
      high: number
    }
  },
  previousPeriod: {
    // Same structure, auto-calculated for comparison
    // Period length matches current range, immediately before `from`
  }
}
```

## Implementation Plan

1. **API: Modify GET /digests** - Add topic filter, topicName, topScore fields
2. **API: Add GET /digests/stats** - New endpoint for analytics
3. **Web: Add DateRangePicker component** - Presets + custom range
4. **Web: Add topic filter to digests page** - Reuse TopicSwitcher pattern
5. **Web: Add StatsCards component** - Three analytics cards
6. **Web: Update DigestsListCondensed** - Add topic, topScore, credits columns
7. **Web: Wire up page** - Connect filters, stats, list with React Query

## Out of Scope

- Clicking cards for drill-down (future enhancement)
- Reader/Timeline layouts (being removed)
- Source health metrics
- Export functionality
