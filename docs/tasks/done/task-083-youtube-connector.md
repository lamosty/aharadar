# Task 083: Complete YouTube Connector with Transcript Preview

## Priority: Medium

## Goal

Complete the YouTube connector stub to fetch channel videos via RSS and optionally include transcript previews for enhanced content representation.

## Background

- YouTube connector exists as stub in `packages/connectors/src/youtube/`
- YouTube provides public RSS feeds for channel uploads: `https://www.youtube.com/feeds/videos.xml?channel_id={id}`
- Transcripts can enhance content quality but must be budget-aware (preview only, not full extraction)

## Read First

- `docs/connectors.md` (YouTube spec section)
- `packages/connectors/src/youtube/*.ts` (existing stubs)
- `packages/connectors/src/rss/*.ts` (reference for RSS/XML parsing)
- `packages/shared/src/types/connector.ts` (FetchParams, FetchResult interfaces)

## Scope

### 1. Complete `packages/connectors/src/youtube/fetch.ts`

- Fetch RSS from `https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}`
- Parse XML using `fast-xml-parser` (already used by RSS connector)
- Extract per-video: `video_id`, `title`, `description`, `published_at`, `author`, `thumbnail_url`
- Support cursoring via `last_published_at` (skip videos older than cursor)
- Respect `limits.maxItems`

### 2. Complete `packages/connectors/src/youtube/normalize.ts`

Map raw video data to `ContentItemDraft`:

- `sourceType`: `"youtube"`
- `externalId`: YouTube video ID
- `canonicalUrl`: `https://youtube.com/watch?v={videoId}`
- `title`: Video title
- `bodyText`: See body text construction below
- `publishedAt`: Video publish date (ISO)
- `author`: Channel name
- `metadata`: `channel_id`, `thumbnail_url`, `transcript_mode`

### 3. Create `packages/connectors/src/youtube/transcript.ts`

- Use `youtube-caption-extractor` npm package (or similar)
- Fetch auto-generated or manual captions when available
- Return first ~3000 characters only (preview mode)
- Handle gracefully when transcripts unavailable
- Budget-aware: respect `transcript_mode` config

**Important:** Full transcript extraction is explicitly out of scope - that is a future "power user plugin" feature.

### 4. Update `packages/connectors/src/youtube/config.ts`

Config schema:

```json
{
  "channel_id": "UCxxxxxxxx",
  "max_video_count": 30,
  "include_transcript": true,
  "transcript_mode": "preview"
}
```

Fields:

- `channel_id` (required): YouTube channel ID
- `max_video_count` (default: 30, clamp 1-100): Max videos per fetch
- `include_transcript` (default: false): Whether to fetch transcript preview
- `transcript_mode` (default: "preview"): Only "preview" supported for now

### 5. Body Text Construction

Construct `bodyText` as follows:

- Video title (already in `title` field, skip in body)
- Video description (first 500 chars, truncated at word boundary)
- If `include_transcript`: transcript preview (first 2000 chars, truncated at sentence boundary)

Total body text should not exceed ~2500 chars.

## Cursor Schema

```json
{
  "last_published_at": "2025-12-17T08:00:00Z",
  "last_video_id": "dQw4w9WgXcQ"
}
```

## Files to Modify

- `packages/connectors/src/youtube/config.ts`
- `packages/connectors/src/youtube/fetch.ts`
- `packages/connectors/src/youtube/normalize.ts`
- `packages/connectors/src/youtube/transcript.ts` (new)
- `packages/connectors/src/youtube/index.ts` (exports)
- `packages/connectors/package.json` (add `youtube-caption-extractor` dependency)
- `pnpm-lock.yaml`

## Out of Scope

- Full transcript extraction (future plugin feature)
- OAuth/API key authentication (public RSS only)
- Playlist ingestion
- Live stream handling
- Comment ingestion

## Test Plan

```bash
pnpm typecheck

# Add a YouTube source
pnpm dev -- admin:sources-add --type youtube --name "yt:example" --config '{"channel_id":"UCxxxx","include_transcript":true}'

# Fetch videos
pnpm dev -- admin:run-now --source-type youtube --max-items-per-source 10

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add YouTube source with channel_id
- [ ] Fetch returns video items from channel RSS
- [ ] Transcript preview included when `include_transcript: true`
- [ ] Graceful handling when transcripts unavailable
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (re-run fetches only new videos)
- [ ] Basic unit tests for normalize function

## Commit

- **Message**: `feat(youtube): implement channel RSS fetch + transcript preview`
- **Files expected**: See "Files to Modify" section
