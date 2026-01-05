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
  windowEnd: string; // ISO
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

**cursor_json (MVP)**

```json
{
  "per_subreddit": {
    "MachineLearning": { "last_seen_created_utc": 1734390000 },
    "programming": { "last_seen_created_utc": 1734390000 }
  }
}
```

**Fetch**

- MVP: use **public endpoints** (JSON or RSS) with an explicit `User-Agent`.
  - JSON listings: `https://www.reddit.com/r/<subreddit>/<listing>.json` (`listing=new|top|hot`)
  - RSS listings: `https://www.reddit.com/r/<subreddit>/.rss` (optional alternative; not implemented yet)
  - Note: public endpoints may be throttled/blocked; we’ll revisit official OAuth later.
- Prefer listing `new` for incremental ingestion.
  - For non-`new` listings (`top|hot`), treat fetch as non-incremental and rely on idempotent upsert by `external_id`.

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

- Proposed MVP approach: use YouTube's channel RSS feed for uploads.
- Transcripts are optional and should be behind config + budget dial.

**Normalize**

- `external_id`: video id
- `canonical_url`: `https://www.youtube.com/watch?v=<id>`
- `title`: video title
- `body_text`: description (+ transcript if enabled/available)
- `author`: channel name
- `published_at`: published date
- `metadata_json`: channel id, duration (if available), etc.

### X/Twitter posts (`type = "x_posts"`) — canonical

**Purpose**
Ingest X/Twitter posts as canonical content items, using a provider-backed access method (initially Grok).

See ADR `0010-x-posts-canonical-via-grok.md` for background on why we use a provider abstraction rather than the official X API directly.

**config_json**

```json
{
  "vendor": "grok",
  "accounts": ["someaccount", "anotheraccount"],
  "keywords": ["optional keywords"],
  "queries": ["optional advanced queries"],
  "maxResultsPerQuery": 20,
  "excludeReplies": true,
  "excludeRetweets": true,
  "cadence": { "mode": "interval", "every_minutes": 1440 }
}
```

Notes:

- `vendor`: provider adapter id (currently `"grok"`); allows swapping to official X API later.
- `accounts`: list of X handles to follow (without `@`).
- `keywords`: optional topic keywords to monitor.
- `queries`: advanced escape hatch; if present, used directly instead of compiling from `accounts`/`keywords`.
- `cadence`: per-source cadence (see ADR 0009); `x_posts` defaults to daily (1440 minutes).

**cursor_json**

```json
{
  "since_id": null,
  "since_time": "2025-12-17T08:00:00Z",
  "last_fetch_at": "2025-12-17T08:00:00Z"
}
```

Notes:

- `since_time` is advanced to `windowEnd` after a successful fetch.
- `last_fetch_at` is updated only after a successful fetch and is used for cadence gating.

**Fetch**

- Use the provider client (e.g., Grok) to search for posts matching the compiled queries.
- The fetch function returns `rawItems` **one per post** (not bundles).
- Respect `limits.maxItems` as the total cap across all queries.

**Normalize**

Each post becomes one `ContentItemDraft`:

- `source_type`: `"x_posts"`
- `canonical_url`: the status URL (`https://x.com/<handle>/status/<id>`)
- `external_id`: status id parsed from URL; fallback to `sha256_hex(vendor|query|day_bucket|url)`
- `title`: `null` (short-form content)
- `body_text`: post text excerpt (no paraphrasing)
- `author`: `@<handle>` when parseable
- `published_at`: best-effort; keep `null` if only a day bucket is available (do not fabricate a timestamp)
- `metadata_json`:
  - `vendor`: the vendor adapter used (e.g., `"grok"`)
  - `query`: the query string used for this fetch
  - `day_bucket`: `YYYY-MM-DD` derived from `windowEnd`
  - `window_start`, `window_end`: ISO timestamps
  - `extracted_urls`: URLs extracted from the post text
  - `primary_url`: best click target (prefer `extracted_urls[0]`, else the post URL)

**Relationship to `signal`**

- `x_posts` is **canonical content**: posts are first-class items that flow through embedding, clustering, ranking, and digests.
- `signal` remains a **derived/amplifier** connector for search/trend/alert semantics (bundles, not canonical ingestion).
- If a user wants both canonical X posts and search-based signals, they can configure separate sources with each type.

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
  "maxResultsPerQuery": 5,
  "excludeReplies": true,
  "excludeRetweets": true,
  "extractUrls": true,
  "extractEntities": true
}
```

Notes (Proposed):

- `accounts` is the primary UX for “follow these accounts”.
- `keywords` supports “monitor a topic” and the “deep dive into a theme” journey.
- `queries` is an advanced escape hatch; if present, it is used directly. Otherwise, the connector compiles queries from `accounts`/`keywords`.
- Tier note (future/policy): in `high` tier we may choose to set `excludeReplies=false`, `excludeRetweets=false`, and raise `maxResultsPerQuery` (e.g. 20) to increase recall at higher cost.

**cursor_json (Proposed)**

```json
{
  "since_id": null,
  "since_time": "2025-12-17T08:00:00Z"
}
```

Notes (MVP):

- `since_time` is advanced to the pipeline `windowEnd` after a successful fetch.
- To control cost/noise, the connector may skip fetching more than once per day per source (based on `since_time` day bucket).
- Use CLI `admin:signal-reset-cursor --clear` to force a wider re-fetch window in local dev.

**Normalize**

The `signal` connector may emit two **kinds** of normalized items, both stored in `content_items` with `source_type = "signal"`.

#### 1) `signal_post_v1` (user-facing; first-class items)

One `ContentItemDraft` per returned post/result. These are intended to be **eligible for clustering and digests** (i.e. shown in inbox/review like other content items).

Field mapping:

- `canonical_url`: the post URL when available (e.g. `https://x.com/<user>/status/<id>`). This is the stable identity for dedupe/idempotency.
- `external_id`: stable; prefer parsing the status id from the post URL. Fallback: `sha256_hex(provider|vendor|query|day_bucket|url)`.
- `title`: null (signals are short-form; avoid paraphrasing into a synthetic title).
- `body_text`: the post excerpt, as returned by the provider (no paraphrasing).
- `published_at`: best-effort (may be null; providers often only return a day bucket, not a full timestamp).

Required `metadata_json` keys:

- `kind`: `"signal_post_v1"`
- `provider`: signal provider id (e.g. `"x_search"`)
- `vendor`: vendor adapter id (e.g. `"grok"`)
- `query`: the compiled query string used for the call
- `day_bucket`: `YYYY-MM-DD` (derived from `windowEnd`)
- `window_start`: pipeline window start (ISO string)
- `window_end`: pipeline window end (ISO string)
- `post_url`: the post URL (redundant with `canonical_url`, but convenient for tooling)
- `extracted_urls`: URLs extracted from the post text (best-effort)
- `primary_url`: “best click target” URL (prefer `extracted_urls[0]`, else the post URL, else null)

#### 2) `signal_bundle_v1` (debug/audit; optional)

One `ContentItemDraft` per `(source_id, query, day_bucket)`. This is **not shown** in digests/review; it exists for debugging and auditability (e.g. “what did the provider return for this query today?”).

Field mapping:

- `external_id`: deterministic synthetic id (sha256 of `provider|vendor|query|day_bucket`)
- `canonical_url`: **null** (bundles are amplifiers; do not claim canonical content)
- `title`: `Signal: <query>` (or other short label)
- `body_text`: short, human-readable evidence (e.g. bullet list of representative post snippets)

Required `metadata_json` keys:

- `kind`: `"signal_bundle_v1"`
- `provider`, `vendor`, `query`, `day_bucket`, `window_start`, `window_end`
- `result_count`: number of results in `signal_results` (int)
- `signal_results`: array of objects `{ date, url, text }` (top N results returned by the provider)
- `extracted_urls`: URLs extracted from the `signal_results[].text` fields (best-effort)
- `primary_url`: “best click target” URL (prefer `extracted_urls[0]`, else first `signal_results[].url`, else null)

`raw_json` retention (dev-friendly):

- May include the full provider response payload for debugging (retention policy TBD for prod; see `docs/data-model.md`).

Debugging:

- Use the CLI `admin:signal-debug --kind post|bundle|all` command to view recent `signal_post_v1` and/or `signal_bundle_v1` rows without manual DB queries.
- By default, bundles are only stored for **unparseable** provider responses. To also persist `signal_bundle_v1` rows for debugging/audit, set `SIGNAL_STORE_BUNDLES=1`.
- To backfill `signal_post_v1` items from already-stored bundles (without calling the provider again), use `admin:signal-explode-bundles` (CLI).

**Future: “X posts” as canonical connector**

If/when X provides a normal pay-as-you-go REST API suitable for canonical ingestion, we can add a **separate connector**:

- `type = "x_posts"` (canonical content)
- It would fetch posts/timelines like other canonical connectors (stable IDs, URLs), and it can coexist with `signal`.

This requires **no refactor** if we keep the connector interface stable; it’s just a new connector module and source type.
