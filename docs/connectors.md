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

### SEC EDGAR (`type = "sec_edgar"`)

**Purpose**
Ingest insider trading filings (Form 4) and institutional holdings (13F) from the SEC's free public API.

**config_json**

```json
{
  "filing_types": ["form4", "13f"],
  "tickers": ["AAPL", "TSLA"],
  "ciks": ["0000320193"],
  "min_transaction_value": 100000,
  "max_filings_per_fetch": 50
}
```

**Fields:**
- `filing_types` (required): Array of `"form4"` and/or `"13f"`
- `tickers` (optional): Filter by company ticker symbols
- `ciks` (optional): Filter by CIK numbers (more precise than tickers)
- `min_transaction_value` (default: 0): Minimum transaction value in USD (Form 4 only)
- `max_filings_per_fetch` (default: 50, clamped 1-100): Max filings per fetch

**cursor_json**

```json
{
  "form4": {
    "last_accession": "0001234567-25-000001",
    "last_fetch_at": "2025-01-08T08:00:00Z"
  },
  "13f": {
    "last_accession": "0001234567-25-000002",
    "last_fetch_at": "2025-01-08T08:00:00Z"
  }
}
```

**Fetch**

MVP approach:
- Fetch Form 4 and 13F RSS feeds from SEC Browse-EDGAR
- For each filing, fetch detailed XML from SEC EDGAR API
- Parse Form 4 transactions and 13F holdings
- Rate limit: Max 10 requests/second (100ms minimum delay between requests)
- Exponential backoff on 429/503 responses

**Normalize**

**Form 4 (Insider Trading):**
- `external_id`: `form4_{accession_number}`
- `canonical_url`: SEC company filing page
- `title`: `[BUY/SELL/...] {Insider Name} - {Company} - ${Amount}`
- `body_text`: Transaction details including insider role, shares, price, and value
- `published_at`: Filing date (ISO)
- `author`: Insider name
- `metadata`:
  - `filing_type`: `"form4"`
  - `ticker`: Company ticker
  - `cik`: Company CIK
  - `insider_name`: Name of insider
  - `insider_title`: Role/title of insider
  - `transaction_type`: `"purchase"` | `"sale"` | `"award"` | etc.
  - `transaction_code`: SEC transaction code (P, S, A, D, etc.)
  - `shares`: Number of shares
  - `price_per_share`: Price per share
  - `total_value`: Total transaction value
  - `shares_owned_after`: Shares owned after transaction
  - `is_direct`: Direct vs indirect ownership
  - `is_officer`, `is_director`, `is_ten_percent_owner`: Relationship flags

**13F (Institutional Holdings):**
- `external_id`: `13f_{accession_number}`
- `canonical_url`: SEC filing page
- `title`: `[13F] {Institution Name} - Q{Quarter} {Year} Holdings`
- `body_text`: Summary of top positions
- `published_at`: Filing date (ISO)
- `author`: Institution name
- `metadata`:
  - `filing_type`: `"13f"`
  - `institution_name`: Name of institution
  - `cik`: Institution CIK
  - `report_period`: Quarter end date
  - `total_value`: Total portfolio value (in thousands)
  - `holdings_count`: Number of positions
  - `top_holdings`: Array of top 10 positions with ticker, name, shares, value

**Environment Variable**

```bash
SEC_EDGAR_USER_AGENT=AhaRadar/1.0 (contact@example.com)
```

Per SEC guidelines, all requests must include a valid User-Agent header with contact information.

### Congress Trading (`type = "congress_trading"`)

**Purpose**
Ingest stock trades disclosed by U.S. Congress members using the Quiver Quantitative API.

**config_json**

```json
{
  "politicians": ["Nancy Pelosi", "Dan Crenshaw"],
  "chambers": ["senate", "house"],
  "min_amount": 15000,
  "transaction_types": ["purchase", "sale"],
  "tickers": ["AAPL", "NVDA", "GOOGL"],
  "max_trades_per_fetch": 50
}
```

**Fields:**
- `politicians` (optional): Filter by specific politicians (case-insensitive partial match)
- `chambers` (optional, default: both): `"senate"` and/or `"house"`
- `min_amount` (default: 0): Minimum transaction amount (lower bound of range)
- `transaction_types` (optional, default: both): `"purchase"` and/or `"sale"`
- `tickers` (optional): Filter by specific stock tickers
- `max_trades_per_fetch` (default: 50, clamped 1-100): Max trades per fetch

**cursor_json**

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "last_report_date": "2025-01-07",
  "seen_trade_ids": ["ct_P000197_NVDA_2025-01-02_purchase"]
}
```

**Fetch**

- Calls Quiver Quantitative `/beta/live/congresstrading` endpoint
- Requires `QUIVER_API_KEY` environment variable
- Applies local filters (politician, chamber, amount, tickers, transaction type)
- Tracks seen trades by composite ID to avoid duplicates
- Gracefully skips if no API key configured

**Normalize**

- `external_id`: `ct_{bioguide_id}_{ticker}_{date}_{transaction_type}` (composite key)
- `canonical_url`: Disclosure link or Quiver page
- `title`: `[{Chamber}] {Politician} ({Party}) {BUY/SELL} {Ticker}`
- `body_text`: Full trade details including asset description, amount range, dates
- `published_at`: Report date (filing date, when information became public)
- `author`: Politician name
- `metadata`:
  - `politician`: Full name
  - `bioguide_id`: Official BioGuide ID
  - `party`: `"D"` | `"R"` | `"I"`
  - `chamber`: `"house"` | `"senate"`
  - `district`: District or state
  - `ticker`: Stock ticker
  - `asset_description`: Full asset description
  - `transaction_type`: `"purchase"` | `"sale"` | `"exchange"`
  - `amount_range`: Original range string (e.g., "$15,001 - $50,000")
  - `amount_min`, `amount_max`: Parsed numeric bounds
  - `transaction_date`: Date of transaction
  - `report_date`: Date of disclosure filing
  - `days_to_disclose`: Days between transaction and report

**Environment Variable**

```bash
QUIVER_API_KEY=your_quiver_api_key_here
```

Sign up for free at https://www.quiverquant.com/ to get an API key. Free tier allows ~100 requests/day.

### Polymarket (`type = "polymarket"`)

**Purpose**
Ingest prediction market data including market questions, probabilities, volume, and price movements from the free public Polymarket Gamma API.

**config_json**

```json
{
  "categories": ["politics", "economics", "crypto"],
  "min_volume": 10000,
  "min_liquidity": 5000,
  "probability_change_threshold": 5,
  "include_resolved": false,
  "max_markets_per_fetch": 50
}
```

**Fields:**
- `categories` (optional): Filter by market categories
- `min_volume` (default: 0): Minimum total volume in USD
- `min_liquidity` (default: 0): Minimum current liquidity
- `probability_change_threshold` (default: 0): Only include markets with probability change >= this percentage points since last check
- `include_resolved` (default: false): Include resolved markets
- `max_markets_per_fetch` (default: 50, clamped 1-200): Max markets per fetch

**cursor_json**

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "seen_condition_ids": ["id1", "id2"],
  "last_prices": {
    "condition_id_1": 0.65,
    "condition_id_2": 0.42
  }
}
```

Note: `last_prices` tracks previous probabilities to calculate change since last fetch.

**Fetch**

- Calls Polymarket Gamma API (`https://gamma-api.polymarket.com/markets`)
- No authentication required (free public API)
- Applies local filters (volume, liquidity, probability change threshold)
- Tracks seen markets and previous prices for change detection
- Conservative rate limiting with exponential backoff on 429

**Normalize**

- `external_id`: `pm_{condition_id}`
- `canonical_url`: `https://polymarket.com/event/{slug}` or `https://polymarket.com/market/{condition_id}`
- `title`: `{Question} - {X}%` or `{Question} - {X}% ({change}pp)` if significant movement
- `body_text`: Market description, probability, volume stats, resolution info
- `published_at`: Market creation date
- `author`: `"Polymarket"`
- `metadata`:
  - `condition_id`: Market condition ID
  - `question`: Full market question
  - `probability`: Current probability (decimal 0-1)
  - `probability_percent`: Current probability as percentage
  - `probability_change`: Change in percentage points since last check (if available)
  - `volume`: Total volume in USD
  - `volume_24h`: 24-hour volume
  - `liquidity`: Current liquidity
  - `spread`: Bid-ask spread
  - `outcomes`: Array of outcome names
  - `outcome_prices`: Array of outcome probabilities
  - `is_active`: Whether market is accepting trades
  - `is_closed`: Whether market is resolved
  - `resolution_status`: `"open"` | `"resolved"`
  - `end_date`: Market resolution date
  - `days_to_resolution`: Days until resolution
  - `resolution_source`: Data authority for resolution

**Use Cases**

1. **All active markets with volume filter:**
   ```json
   { "min_volume": 10000 }
   ```

2. **Alert on significant probability movements:**
   ```json
   { "probability_change_threshold": 5, "min_volume": 50000 }
   ```

3. **High-liquidity markets only:**
   ```json
   { "min_volume": 100000, "min_liquidity": 25000 }
   ```

### Options Flow (`type = "options_flow"`)

**Purpose**
Ingest unusual options activity including sweeps, blocks, and unusual volume using the Unusual Whales API.

**config_json**

```json
{
  "symbols": ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"],
  "min_premium": 100000,
  "flow_types": ["sweep", "block", "unusual"],
  "sentiment_filter": null,
  "include_etfs": true,
  "expiry_max_days": 90,
  "max_alerts_per_fetch": 50
}
```

**Fields:**
- `symbols` (optional): Filter by specific tickers (empty = all)
- `min_premium` (default: 50000): Minimum order premium in USD
- `flow_types` (optional): Array of `"sweep"`, `"block"`, `"unusual"` (empty = all)
- `sentiment_filter` (optional): `"bullish"` | `"bearish"` | null for all
- `include_etfs` (default: true): Include ETF options (SPY, QQQ, etc.)
- `expiry_max_days` (default: 90): Max days to expiration
- `max_alerts_per_fetch` (default: 50, clamped 1-100): Max alerts per fetch

**cursor_json**

```json
{
  "last_fetch_at": "2025-01-08T14:30:00Z",
  "last_seen_id": "flow_12345",
  "seen_ids": ["flow_12340", "flow_12341", "flow_12342"]
}
```

**Fetch**

- Calls Unusual Whales public API (`https://api.unusualwhales.com/api/flow`)
- Requires `UNUSUAL_WHALES_API_KEY` environment variable
- Applies local filters (symbols, premium, flow type, sentiment, expiry)
- Tracks seen flow IDs to avoid duplicates
- Gracefully skips if no API key configured

**Normalize**

- `external_id`: `of_{flow_id}`
- `canonical_url`: `https://unusualwhales.com/flow?symbol={SYMBOL}`
- `title`: `[FLOW_TYPE] $SYMBOL $STRIKEC/P EXPIRY - $PREMIUM (SENTIMENT)`
  - Example: `[SWEEP] $AAPL $180C 1/17 - $2.1M (Bullish)`
- `bodyText`: Contract details, order info, volume/OI comparison
- `publishedAt`: Order timestamp
- `author`: `"Options Flow"`
- `metadata`:
  - `symbol`: Underlying ticker
  - `strike`: Strike price
  - `expiry`: Expiration date
  - `contract_type`: `"call"` | `"put"`
  - `flow_type`: `"sweep"` | `"block"` | `"unusual"`
  - `sentiment`: `"bullish"` | `"bearish"` | `"neutral"`
  - `premium`: Total premium in USD
  - `volume`: Number of contracts
  - `open_interest`: Prior OI
  - `volume_oi_ratio`: volume / open_interest
  - `spot_price`: Underlying price at order time
  - `days_to_expiry`: Days until expiration
  - `is_weekly`: Boolean (weekly options)
  - `is_otm`: Boolean (out of the money)

**Sentiment Classification**

If the API doesn't provide sentiment, it's classified locally:
- Sweeps on OTM calls = bullish
- Sweeps on OTM puts = bearish
- ITM options = neutral (could be hedging)

**Environment Variable**

```bash
UNUSUAL_WHALES_API_KEY=your_api_key_here
```

Sign up at https://unusualwhales.com/ for API access.

**Use Cases**

1. **Track major stocks with large orders:**
   ```json
   { "symbols": ["SPY", "QQQ", "AAPL", "NVDA"], "min_premium": 100000 }
   ```

2. **Bullish sweeps only:**
   ```json
   { "flow_types": ["sweep"], "sentiment_filter": "bullish", "min_premium": 500000 }
   ```

3. **Near-term plays (weeklies):**
   ```json
   { "expiry_max_days": 14, "min_premium": 50000 }
   ```

### Market Sentiment (`type = "market_sentiment"`)

**Purpose**
Track social media sentiment for stocks aggregated from Reddit, Twitter, and StockTwits using the Finnhub API.

**config_json**

```json
{
  "tickers": ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"],
  "sentiment_change_threshold": 10,
  "min_mentions": 100,
  "alert_on_extreme": true,
  "extreme_threshold": 0.8,
  "max_tickers_per_fetch": 10
}
```

**Fields:**
- `tickers` (required): List of stock tickers to monitor
- `sentiment_change_threshold` (default: 0): Only emit if sentiment changed by this % since last fetch
- `min_mentions` (default: 0): Minimum mention count to include
- `alert_on_extreme` (default: false): Emit when sentiment is extremely bullish/bearish
- `extreme_threshold` (default: 0.8): Threshold for extreme sentiment (0.5-1.0 scale)
- `max_tickers_per_fetch` (default: 10, max: 30): Rate limit protection

**cursor_json**

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "ticker_scores": {
    "AAPL": { "score": 0.65, "mentions": 650, "fetched_at": "2025-01-07T08:00:00Z" }
  }
}
```

**Fetch**

- Calls Finnhub Social Sentiment API (`https://finnhub.io/api/v1/stock/social-sentiment`)
- Requires `FINNHUB_API_KEY` environment variable
- Rate limited: 60 requests/minute (free tier)
- Built-in delay between requests to respect limits
- Tracks previous scores for change detection

**Normalize**

- `external_id`: `ms_{ticker}_{YYYY-MM-DD}`
- `canonical_url`: Finnhub API URL
- `title`: `{Ticker} sentiment: {Label} ({score})` or with change: `{Ticker} sentiment: {Label} ({score}, +15% change)`
- `bodyText`: Mention breakdown, score components, comparison to previous
- `publishedAt`: Data timestamp from API
- `author`: `"Finnhub Social Sentiment"`
- `metadata`:
  - `ticker`: Stock ticker
  - `sentiment_score`: Composite score (-1 to 1)
  - `sentiment_label`: `"bullish"` | `"bearish"` | `"neutral"`
  - `is_extreme`: Boolean
  - `total_mentions`: Total mention count
  - `positive_mentions`, `negative_mentions`, `neutral_mentions`: Breakdown
  - `positive_score`, `negative_score`: Score components
  - `previous_score`: Score from last fetch
  - `score_change`: Percentage change

**Sentiment Classification**

- Score >= 0.1 = bullish
- Score <= -0.1 = bearish
- Otherwise = neutral
- Extreme = |score| > normalized threshold

**Environment Variable**

```bash
FINNHUB_API_KEY=your_api_key_here
```

Sign up free at https://finnhub.io/ - 60 API calls/minute.

**Limitations**

1. **Noisy signal** - Social sentiment has limited predictive value
2. **Lagging indicator** - By the time sentiment is measurable, price may have moved
3. **Coverage varies** - Not all tickers have sufficient social data
4. **Free tier limits** - 60 req/min restricts monitoring many tickers

**Use Cases**

1. **Track major indices:**
   ```json
   { "tickers": ["SPY", "QQQ"], "min_mentions": 100 }
   ```

2. **Alert on sentiment shifts:**
   ```json
   { "tickers": ["AAPL", "TSLA", "NVDA"], "sentiment_change_threshold": 10 }
   ```

3. **Extreme sentiment alerts:**
   ```json
   { "tickers": ["GME", "AMC"], "alert_on_extreme": true, "extreme_threshold": 0.7 }
   ```

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

### Signals (`type = "signal"`) — derived/amplifier (bundle-only)

**Purpose**
Store summarized signals from a signal provider (search/trend/alerts) for debugging, auditing, and future corroboration. The `signal` connector is a **derived/amplifier** connector — it does **not** produce canonical content items that appear in user digests.

For canonical X/Twitter post ingestion, use `x_posts` instead (see above).

Provider abstraction (recommended):

- define a `SignalProvider` interface (X search, official APIs, other vendors, etc.)
- the connector depends on the interface, not on a specific vendor

**config_json**

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

Notes:

- `accounts` is the primary UX for "follow these accounts".
- `keywords` supports "monitor a topic" and the "deep dive into a theme" journey.
- `queries` is an advanced escape hatch; if present, it is used directly. Otherwise, the connector compiles queries from `accounts`/`keywords`.

**cursor_json**

```json
{
  "since_id": null,
  "since_time": "2025-12-17T08:00:00Z"
}
```

Notes:

- `since_time` is advanced to the pipeline `windowEnd` after a successful fetch.
- To control cost/noise, the connector skips fetching more than once per day per source (based on `since_time` day bucket).
- Use CLI `admin:signal-reset-cursor --clear` to force a wider re-fetch window in local dev.

**Normalize**

The `signal` connector emits **bundle items only** (`signal_bundle_v1`), stored in `content_items` with `source_type = "signal"`.

#### `signal_bundle_v1` (debug/audit)

One `ContentItemDraft` per `(source_id, query, day_bucket)`. Bundles are **not shown** in digests/review; they exist for:

- debugging and auditability ("what did the provider return for this query today?")
- future signal corroboration (boosting clusters whose URLs appear in recent signal bundles)

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
- `primary_url`: "best click target" URL (prefer `extracted_urls[0]`, else first `signal_results[].url`, else null)

`raw_json` retention (dev-friendly):

- May include the full provider response payload for debugging (retention policy TBD for prod; see `docs/data-model.md`).

Debugging:

- Use the CLI `admin:signal-debug --kind bundle --limit N` command to view recent `signal_bundle_v1` rows.
- By default, bundles are only stored for **unparseable** provider responses. To also persist `signal_bundle_v1` rows for debugging/audit, set `SIGNAL_STORE_BUNDLES=1`.

**Relationship to `x_posts`**

- `x_posts` is the **canonical** connector for X/Twitter posts: posts are first-class items that flow through embedding, clustering, ranking, and digests.
- `signal` is a **derived/amplifier** connector: bundles are stored for auditing and (future) corroboration, but do not appear in user digests.
- If a user wants both canonical X posts and search-based signal bundles, they can configure separate sources with each type.

**Migration from legacy signal-stored X content**

If your local/dev DB contains old `signal_post_v1` items from before `x_posts` was introduced, see `docs/migrations/migration-signal-x-to-x-posts.md` for the recommended approach (reset + re-ingest).
