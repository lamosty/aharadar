# Aha Radar — Connectors Spec (MVP)

Connectors fetch items from a source and normalize them into a unified `ContentItemDraft`.

## Two connector “semantics”: canonical content vs signals (important)

Not all sources behave the same way. For MVP, it’s useful to distinguish:

### Canonical content connectors

Examples: Reddit posts, HN stories, RSS entries, YouTube videos.

Properties:
- usually have stable IDs and/or canonical URLs
- the item itself is something the user can read/watch
- good fit for dedupe/clustering and for deep summaries

### Signal connectors (search/trend/alerts)

Examples: X/Twitter search results, “breaking news” alerts, watchlists, trend detectors.

Properties:
- often **derived** from a search/trend query (not a canonical feed)
- may not have stable identifiers
- often best used as a **signal amplifier**:
  - extract URLs/entities/topics
  - boost ranking of clusters that are also corroborated by canonical sources

Important: **X is not special here**. In MVP we may start with X/Twitter signals because it’s high-value for realtime discovery, but the abstraction is “signal connectors” in general.

## Connector principles (MVP)

- **Pluggable**: new sources should not require refactoring pipeline core.
- **Incremental**: connectors must support cursor-based fetching where feasible.
- **Public-first**: avoid user account linking/OAuth for public sources in MVP.
- **Policy-safe**: no paywall bypassing, no ToS violations.
- **Deterministic normalization**: canonicalize URLs and hash consistently.

## Common interface (contract)

The master spec defines:
- `fetch(cursor, limits) -> RawItem[]`
- `normalize(raw) -> ContentItemDraft`

For practical cursor updates, we extend `fetch` to return a next cursor:

```ts
type SourceType = "reddit" | "hn" | "rss" | "youtube" | "signal" | string;

type Cursor = Record<string, unknown>;

interface FetchParams {
  userId: string;
  sourceId: string;
  sourceType: SourceType;
  config: Record<string, unknown>;
  cursor: Cursor; // from sources.cursor_json
  limits: {
    maxItems: number;
    maxComments?: number;
  };
  windowStart: string; // ISO
  windowEnd: string;   // ISO
}

interface FetchResult {
  rawItems: unknown[];
  nextCursor: Cursor;
  meta?: Record<string, unknown>; // timing, rate limit info, etc.
}

interface ContentItemDraft {
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  source_type: SourceType;
  external_id: string | null;
  published_at: string | null; // ISO
  author: string | null;
  metadata_json: Record<string, unknown>;
  raw_json?: unknown; // optional retention
}

interface Connector {
  sourceType: SourceType;
  fetch(params: FetchParams): Promise<FetchResult>;
  normalize(raw: unknown, params: FetchParams): Promise<ContentItemDraft>;
}
```

## Shared normalization rules

### URL canonicalization (FR‑010)

Canonicalization must:
- normalize scheme/host
- strip tracking params (`utm_*`, `fbclid`, `gclid`, etc.)
- normalize trailing slashes
- preserve query params that change the content identity (TBD allowlist per domain)

If `canonical_url` is present, compute:
- `hash_url = sha256_hex(canonical_url)`

### Text for embeddings

Embedding input (deterministic):
- `title + "\n\n" + body_text`, truncated to a fixed max length.

Optionally compute:
- `hash_text = sha256_hex(embedding_input_text)`

### Required identity

Each stored item must have at least one stable identity:
- `(source_id, external_id)` **or**
- `hash_url`

If a source cannot provide stable external IDs and there is no URL, connectors must generate a stable synthetic external ID (hash).

## Connector specs

### Reddit (`type = "reddit"`)

**Purpose**
Ingest posts from public subreddits (optionally top comments).

**config_json (Proposed)**
```json
{
  "subreddits": ["MachineLearning", "programming"],
  "listing": "new",
  "time_filter": "day",
  "include_comments": false,
  "max_comment_count": 0,
  "include_nsfw": false
}
```

**cursor_json (Proposed)**
```json
{
  "after": "t3_abc123",
  "last_seen_created_utc": 1734390000
}
```

**Fetch**
- Use public JSON endpoints (rate limited; set an explicit User-Agent).
- Prefer listing `new` for incremental ingestion.

**Normalize**
- `external_id`: Reddit post id/fullname
- `canonical_url`:
  - link post: canonicalized `url`
  - text post: `https://www.reddit.com{permalink}`
- `title`: post title
- `body_text`: `selftext` (+ optionally appended top comments text)
- `author`: Reddit username
- `published_at`: `created_utc`
- `metadata_json`: subreddit, score, num_comments, flair, etc.

### Hacker News (`type = "hn"`)

**Purpose**
Ingest stories (optionally comments).

**config_json (Proposed)**
```json
{
  "feed": "top",
  "max_story_count": 100,
  "include_comments": false,
  "max_comment_count": 0
}
```

**cursor_json (Proposed)**
```json
{
  "last_run_at": "2025-12-17T08:00:00Z"
}
```

**Fetch**
- Proposed MVP approach: use the official HN Firebase API.
- Note: “top” feeds are not strictly incremental; rely on external_id dedupe.

**Normalize**
- `external_id`: HN item id (string)
- `canonical_url`: `url` if present else `https://news.ycombinator.com/item?id=<id>`
- `title`: story title
- `body_text`: `text` (HTML stripped) plus optional top comment snippets
- `author`: `by`
- `published_at`: `time`
- `metadata_json`: score, descendants, type

### RSS (`type = "rss"`)

**Purpose**
Ingest items from any RSS/Atom feed.

**config_json (Proposed)**
```json
{
  "feed_url": "https://example.com/rss.xml",
  "max_item_count": 50,
  "prefer_content_encoded": true
}
```

**cursor_json (Proposed)**
```json
{
  "last_published_at": "2025-12-17T08:00:00Z",
  "recent_guids": ["guid1", "guid2"]
}
```

**Normalize**
- `external_id`: entry GUID if present else null
- `canonical_url`: entry link (canonicalized)
- `title`: entry title
- `body_text`: `content:encoded` if available else summary/description
- `published_at`: entry published date (fallback: fetched time)
- `metadata_json`: feed title, categories, etc.

### Future (v2): Web pages / sites (`type = "web"`)

**Purpose**
Ingest articles from websites/blogs/news outlets when RSS/Atom is not available (or insufficient).

**Status**
Deferred to v2 (documented for future; not implemented in MVP).

Important constraints:
- RSS is still preferred when available (cheaper, more reliable).
- No paywall bypassing; if a page is paywalled/blocked, store minimal metadata and the URL.
- Respect reasonable crawl behavior (rate limiting, backoff, timeouts).

**What this is (and isn’t)**
- This can cover “a lot of the web” for public pages, but it won’t be perfect for every site.
- The MVP should aim for **semi-generic** extraction:
  - generic “article text extraction” (Readability-style) works for many pages
  - discovery of “latest posts” still often needs a configured listing/seed URL and/or patterns

**config_json (Proposed)**
```json
{
  "seed_urls": ["https://example.com/news", "https://example.com/blog"],
  "allowed_domains": ["example.com"],
  "discovery": {
    "mode": "link_scrape",
    "url_patterns": ["/news/", "/blog/", "/posts/"],
    "deny_patterns": ["/tag/", "/category/", "/about", "/privacy"]
  },
  "fetch": {
    "method": "http",
    "user_agent": "aharadar/0.x (+https://example.com)"
  },
  "extract": {
    "strategy": "readability",
    "use_jsonld": true,
    "use_opengraph": true
  }
}
```

**cursor_json (Proposed)**
```json
{
  "last_run_at": "2025-12-17T08:00:00Z"
}
```

**Fetch (Proposed)**
- Fetch each `seed_url` HTML.
- Extract candidate links:
  - filter by `allowed_domains` and `url_patterns`
  - take top N candidates (bounded by `limits.maxItems`)
- Fetch candidate article pages and extract:
  - title
  - main text content
  - canonical URL (`<link rel="canonical">`) + OpenGraph/JSON-LD metadata
  - published_at if available (JSON-LD/og/article meta)

**Normalize (Proposed)**
- `external_id`: null (usually not stable) — rely on canonical URL hashing for dedupe
- `canonical_url`: canonicalized `rel=canonical` (fallback: final URL after redirects)
- `title`: extracted title
- `body_text`: extracted main content text
- `author`: extracted author if available
- `published_at`: extracted date if available (fallback: fetched time)
- `metadata_json`: seed_url, extraction strategy, structured meta fields

**Implementation note**
The extraction strategy should be pluggable (ADR candidate):
- open-source “readability” style libraries (works for many articles)
- optional headless fallback for JS-heavy pages (expensive; likely dial-up)
- optional external extraction providers (paid/hosted) behind an interface

### YouTube (`type = "youtube"`)

**Purpose**
Ingest channel uploads; optionally fetch transcripts.

**config_json (Proposed)**
```json
{
  "channel_id": "UCxxxx",
  "max_video_count": 30,
  "include_transcript": false
}
```

**cursor_json (Proposed)**
```json
{
  "last_published_at": "2025-12-17T08:00:00Z",
  "last_video_id": "dQw4w9WgXcQ"
}
```

**Fetch**
- Proposed MVP approach: use YouTube’s channel RSS feed for uploads.
- Transcripts are optional and should be behind config + budget dial.

**Normalize**
- `external_id`: video id
- `canonical_url`: `https://www.youtube.com/watch?v=<id>`
- `title`: video title
- `body_text`: description (+ transcript if enabled/available)
- `author`: channel name
- `published_at`: published date
- `metadata_json`: channel id, duration (if available), etc.

### Signals (`type = "signal"`) — search/trend/alerts

**Purpose**
Ingest summarized signals from a signal provider (search/trend/alerts). Initial MVP adapter can be X/Twitter search (ADR 0003), but the connector type is generic.

Provider abstraction (recommended):
- define a `SignalProvider` interface (X search, official APIs, other vendors, etc.)
- the connector depends on the interface, not on a specific vendor

**config_json (Proposed)**
```json
{
  "provider": "x_search",
  "vendor": "grok",
  "accounts": ["someaccount", "anotheraccount"],
  "keywords": ["bitcoin", "macro", "rates"],
  "queries": ["from:someaccount (keyword OR phrase)", "topic keyword filter"],
  "max_results_per_query": 20,
  "extract_urls": true,
  "extract_entities": true
}
```

Notes (Proposed):
- `accounts` is the primary UX for “follow these accounts”.
- `keywords` supports “monitor a topic” and the “deep dive into a theme” journey.
- `queries` is an advanced escape hatch; if present, it is used directly. Otherwise, the connector compiles queries from `accounts`/`keywords`.

**cursor_json (Proposed)**
```json
{
  "since_id": null,
  "since_time": "2025-12-17T08:00:00Z"
}
```

**Normalize**
- `external_id`: provider-native stable id if present; else stable synthetic id
- `canonical_url`: may be null; if URLs exist in results, store them in metadata (and optionally choose a “primary” URL)
- `title`: optional short label
- `body_text`: summarized “signal” text (what’s happening + why it matters)
- `metadata_json`: provider id, query, extracted URLs, extracted entities, representative snippets

**Future: “X posts” as canonical connector**

If/when X provides a normal pay-as-you-go REST API suitable for canonical ingestion, we can add a **separate connector**:
- `type = "x_posts"` (canonical content)
- It would fetch posts/timelines like other canonical connectors (stable IDs, URLs), and it can coexist with `signal`.

This requires **no refactor** if we keep the connector interface stable; it’s just a new connector module and source type.


