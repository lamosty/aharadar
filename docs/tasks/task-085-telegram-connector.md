# Task 085: Add Telegram Connector for Public Channels

## Priority: Medium

## Goal

Add a Telegram connector to fetch messages from public Telegram channels via the Telegram Bot API.

## Background

Telegram public channels are valuable content sources for many topics (crypto, tech news, trading signals). The Bot API provides a way to read public channel messages without requiring user account linking.

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- Telegram Bot API docs: https://core.telegram.org/bots/api

## Prerequisites

1. Create a Telegram bot via @BotFather
2. Get bot token
3. Add bot as admin to target channels (for private channels) or just use for public channels

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/telegram/`:

- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch messages via Bot API
- `normalize.ts` - Map messages to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

```json
{
  "channels": ["@channel1", "@channel2"],
  "max_messages_per_channel": 50,
  "include_media_captions": true,
  "include_forwards": true
}
```

Fields:

- `channels` (required): List of public channel usernames (with or without @)
- `max_messages_per_channel` (default: 50, clamp 1-100): Max messages per channel
- `include_media_captions` (default: true): Extract captions from media posts
- `include_forwards` (default: true): Include forwarded messages

### 3. Environment Variable

Add `TELEGRAM_BOT_TOKEN` to `.env.example`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 4. Fetch Implementation

`packages/connectors/src/telegram/fetch.ts`:

```typescript
// Approach 1: Use getUpdates with channel posts (limited)
// Approach 2: Use forwardMessage to bot's saved messages (workaround)
// Approach 3: Use getChatHistory via Telegram client (requires phone auth)
```

**Recommended approach for MVP:**

- Use `getUpdates` to receive channel posts the bot can see
- Bot must be added as admin to receive channel posts
- For truly public channels without admin access, consider web scraping as fallback (document limitations)

Alternative: Use `telegram` npm package with MTProto (more powerful but requires phone auth)

### 5. Normalize Implementation

Map Telegram message to `ContentItemDraft`:

- `sourceType`: `"telegram"`
- `externalId`: `{channel_id}_{message_id}`
- `canonicalUrl`: `https://t.me/{channel}/{message_id}`
- `title`: null (short-form content)
- `bodyText`: Message text or media caption
- `publishedAt`: Message date (Unix timestamp -> ISO)
- `author`: Channel name
- `metadata`:
  - `channel_id`
  - `channel_username`
  - `message_type`: text/photo/video/document/etc.
  - `has_media`: boolean
  - `forward_from`: original channel if forwarded
  - `views`: view count if available
  - `reactions`: reaction counts if available

### 6. Cursor Schema

```json
{
  "per_channel": {
    "@channel1": {
      "last_message_id": 12345,
      "last_fetch_at": "2025-12-17T08:00:00Z"
    }
  }
}
```

### 7. Error Handling

Handle common Telegram API errors:

- `400 Bad Request: chat not found` - Channel doesn't exist or is private
- `403 Forbidden: bot was kicked` - Bot removed from channel
- `429 Too Many Requests` - Rate limited, respect `retry_after`

### 8. Rate Limiting

Telegram Bot API limits:

- 30 messages per second to same chat
- 20 messages per minute to same group
- Respect `retry_after` in 429 responses

Implement backoff strategy in fetch.

## Files to Create

- `packages/connectors/src/telegram/config.ts`
- `packages/connectors/src/telegram/fetch.ts`
- `packages/connectors/src/telegram/normalize.ts`
- `packages/connectors/src/telegram/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "telegram" to SourceType)
- `packages/connectors/src/index.ts` (register telegram connector)
- `.env.example` (add TELEGRAM_BOT_TOKEN)
- `docs/connectors.md` (add Telegram spec)

## Limitations to Document

Document these limitations in `docs/connectors.md`:

1. **Public channels only** - Private channels require bot admin access
2. **Some channels block bots** - Channels can restrict bot access
3. **Rate limiting** - Telegram enforces strict rate limits
4. **No historical access** - Can only fetch recent messages bot has seen
5. **Media not downloaded** - Only captions extracted, not actual media files

## Out of Scope

- Private channel access
- User account authentication (MTProto)
- Media file downloads
- Message editing/deletion tracking
- Real-time updates (webhook mode)

## Test Plan

```bash
pnpm typecheck

# Set up bot token
export TELEGRAM_BOT_TOKEN=your_token

# Add a Telegram source
pnpm dev -- admin:sources-add --type telegram --name "tg:example" --config '{"channels":["@duaborz"]}'

# Fetch messages
pnpm dev -- admin:run-now --source-type telegram --max-items-per-source 20

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add Telegram source with channel list
- [ ] Fetch returns messages from public channels
- [ ] Media captions extracted
- [ ] Rate limiting respected
- [ ] Graceful error handling for inaccessible channels
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (re-run fetches only new messages)
- [ ] Limitations documented

## Commit

- **Message**: `feat(telegram): add Telegram public channel connector via Bot API`
- **Files expected**: See "Files to Create/Modify" sections
