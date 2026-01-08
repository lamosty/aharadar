# Task 084: Add RSS-Based Connector Types with Custom UI/Formatting

## Priority: Medium

## Goal

Add specialized source types that use RSS under the hood but provide custom UI, icons, and field extraction for better UX. Users should see "Podcast", "Substack", etc. as distinct source types in the UI, not generic RSS.

## Background

Many valuable content sources expose RSS feeds but have platform-specific fields and UX expectations. Rather than forcing users to configure generic RSS and lose context, we create typed wrappers that:
- Auto-detect feed URLs from user input
- Extract platform-specific metadata
- Display with appropriate icons/labels in UI
- Share the core RSS fetch logic

## Read First

- `packages/connectors/src/rss/*.ts` (existing RSS implementation)
- `packages/shared/src/types/connector.ts` (SourceType definition)
- `docs/connectors.md` (RSS spec)

## Scope

### 1. Add Source Types

Update `packages/shared/src/types/connector.ts`:

```typescript
export type SourceType =
  | "reddit"
  | "hn"
  | "rss"
  | "youtube"
  | "signal"
  | "podcast"
  | "substack"
  | "medium"
  | "arxiv"
  | "lobsters"
  | "producthunt"
  | "github_releases"
  | string;
```

### 2. Create Connector Directories

For each type, create `packages/connectors/src/{type}/`:
- `config.ts` - Parse and validate config
- `normalize.ts` - Map RSS items to ContentItemDraft with custom fields
- `index.ts` - Export normalize function, reuse RSS fetch

### 3. Type-Specific Implementations

| Type | RSS Pattern | Config | Custom Metadata Fields |
|------|-------------|--------|------------------------|
| `podcast` | Standard RSS with enclosures | `feed_url` | `duration`, `enclosure_url`, `episode_number`, `season` |
| `substack` | `{pub}.substack.com/feed` | `publication` or `feed_url` | `publication_name`, `subtitle`, `likes` |
| `medium` | `medium.com/feed/@{user}` | `username` or `feed_url` | `claps`, `reading_time`, `collection` |
| `arxiv` | `arxiv.org/rss/{category}` | `category` | `authors[]`, `pdf_url`, `abstract`, `arxiv_id` |
| `lobsters` | `lobste.rs/rss` | (none, single feed) | `tags[]`, `comment_count`, `submitter`, `domain` |
| `producthunt` | `producthunt.com/feed` | (none, single feed) | `votes`, `maker`, `tagline`, `topics[]` |
| `github_releases` | `github.com/{owner}/{repo}/releases.atom` | `owner`, `repo` | `version`, `release_notes`, `assets[]`, `prerelease` |

### 4. URL Detection Helper

Create `packages/connectors/src/utils/detect_source_type.ts`:

```typescript
export function detectSourceTypeFromUrl(url: string): SourceType | null {
  if (url.includes('.substack.com')) return 'substack';
  if (url.includes('medium.com/feed')) return 'medium';
  if (url.includes('arxiv.org/rss')) return 'arxiv';
  if (url.includes('lobste.rs')) return 'lobsters';
  if (url.includes('producthunt.com')) return 'producthunt';
  if (url.includes('github.com') && url.includes('/releases')) return 'github_releases';
  // Check for podcast indicators (enclosure, itunes namespace)
  return null; // Fallback to generic RSS
}
```

### 5. Shared RSS Fetch

All types should reuse `fetchRss()` from the RSS connector. Only the normalize step differs.

Create helper in `packages/connectors/src/utils/rss_shared.ts`:
```typescript
export { fetchRss } from '../rss/fetch';
```

### 6. Connector Registry Update

Update `packages/connectors/src/index.ts` to register all new types.

### 7. UI Updates

Update source creation UI in `packages/web/`:
- Show dropdown with all source types
- Type-specific icons (podcast icon, Substack logo, etc.)
- Type-specific config fields
- Auto-detect type when user pastes URL

## Files to Create/Modify

**New directories:**
- `packages/connectors/src/podcast/`
- `packages/connectors/src/substack/`
- `packages/connectors/src/medium/`
- `packages/connectors/src/arxiv/`
- `packages/connectors/src/lobsters/`
- `packages/connectors/src/github_releases/`
- `packages/connectors/src/producthunt/`
- `packages/connectors/src/utils/`

**Modify:**
- `packages/shared/src/types/connector.ts`
- `packages/connectors/src/index.ts`
- `packages/web/src/components/sources/` (UI components)

## Out of Scope

- Podcast audio transcription
- Medium paywall handling
- GitHub API integration (Atom feed only)
- ProductHunt API (RSS only)

## Test Plan

```bash
pnpm typecheck

# Test each type
pnpm dev -- admin:sources-add --type podcast --name "pod:example" --config '{"feed_url":"https://example.com/podcast.rss"}'
pnpm dev -- admin:sources-add --type substack --name "sub:example" --config '{"publication":"example"}'
pnpm dev -- admin:sources-add --type arxiv --name "arxiv:cs.AI" --config '{"category":"cs.AI"}'

pnpm dev -- admin:run-now --source-type podcast
pnpm dev -- admin:run-now --source-type substack
pnpm dev -- admin:run-now --source-type arxiv

pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] All 7 source types registered in SourceType
- [ ] Each type has config.ts, normalize.ts, index.ts
- [ ] Custom metadata fields extracted where available
- [ ] RSS fetch logic shared (not duplicated)
- [ ] URL detection helper works for common patterns
- [ ] UI shows type-specific icons/labels
- [ ] `pnpm typecheck` passes
- [ ] Can successfully fetch from each type

## Commit

- **Message**: `feat(connectors): add RSS-based source types (podcast, substack, medium, arxiv, lobsters, producthunt, github_releases)`
- **Files expected**: See "Files to Create/Modify" section
