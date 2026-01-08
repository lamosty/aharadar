# Task 091: Market Sentiment Connector via Finnhub

## Priority: Low

## Goal

Add a market sentiment connector to fetch social sentiment scores for stocks using the Finnhub free tier API.

## Background

Finnhub provides social sentiment data aggregated from Reddit, Twitter, and StockTwits. This can indicate retail investor sentiment and potential momentum. However, social sentiment is inherently noisy and should be treated as a supplementary signal rather than a primary data source.

**Note:** This task is LOWER PRIORITY than SEC EDGAR (Task 088), Polymarket (Task 089), and Congress Trading (Task 090). Social sentiment data is noisy and has limited predictive value. Implement only after completing higher-priority financial connectors.

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- Finnhub API docs: https://finnhub.io/docs/api/social-sentiment
- Finnhub free tier limits: https://finnhub.io/pricing

## Prerequisites

1. Sign up for free Finnhub account
2. Obtain API key from dashboard
3. Free tier limits: 60 requests/minute, some endpoints restricted

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/market_sentiment/`:
- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch sentiment via Finnhub API
- `normalize.ts` - Map sentiment to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

```json
{
  "tickers": ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"],
  "sentiment_change_threshold": 10,
  "min_mentions": 100,
  "include_reddit": true,
  "include_twitter": true,
  "alert_on_extreme": true,
  "extreme_threshold": 0.8
}
```

Fields:
- `tickers` (required): List of stock tickers to monitor
- `sentiment_change_threshold` (default: 0): Only emit if sentiment score changed by this percentage since last fetch
- `min_mentions` (default: 0): Minimum mention count to include
- `include_reddit` (default: true): Include Reddit sentiment data
- `include_twitter` (default: true): Include Twitter sentiment data
- `alert_on_extreme` (default: false): Emit item when sentiment is extremely bullish/bearish
- `extreme_threshold` (default: 0.8): Threshold for extreme sentiment (0-1 scale, 0.8 = very bullish or <0.2 = very bearish)

### 3. Environment Variable

Add API key to `.env.example`:

```
FINNHUB_API_KEY=your_finnhub_api_key_here
```

### 4. API Endpoints

**Finnhub Social Sentiment:**

1. **Social Sentiment (by ticker):**
   ```
   GET https://finnhub.io/api/v1/stock/social-sentiment?symbol={ticker}&token={api_key}
   ```

2. **Response Format:**
   ```json
   {
     "symbol": "AAPL",
     "reddit": [
       {
         "atTime": "2025-01-08T00:00:00Z",
         "mention": 150,
         "positiveMention": 100,
         "negativeMention": 30,
         "score": 0.65
       }
     ],
     "twitter": [
       {
         "atTime": "2025-01-08T00:00:00Z",
         "mention": 500,
         "positiveMention": 350,
         "negativeMention": 100,
         "score": 0.70
       }
     ]
   }
   ```

### 5. Fetch Implementation

`packages/connectors/src/market_sentiment/fetch.ts`:

```typescript
interface FinnhubSentimentData {
  atTime: string;
  mention: number;
  positiveMention: number;
  negativeMention: number;
  score: number;  // 0-1, higher = more bullish
}

interface FinnhubSentimentResponse {
  symbol: string;
  reddit: FinnhubSentimentData[];
  twitter: FinnhubSentimentData[];
}

interface AggregatedSentiment {
  ticker: string;
  fetchedAt: string;
  totalMentions: number;
  positiveMentions: number;
  negativeMentions: number;
  neutralMentions: number;
  compositeScore: number;  // Weighted average of reddit + twitter
  redditScore: number | null;
  twitterScore: number | null;
  redditMentions: number;
  twitterMentions: number;
  sentimentLabel: "bullish" | "bearish" | "neutral";
  isExtreme: boolean;
}
```

**Fetch Logic:**
1. Iterate through configured tickers
2. Call `/stock/social-sentiment` for each ticker
3. Aggregate Reddit and Twitter data
4. Calculate composite sentiment score
5. Compare with previous fetch (from cursor) to detect significant changes
6. Return tickers meeting threshold criteria

### 6. Sentiment Calculation

```typescript
function calculateCompositeSentiment(
  reddit: FinnhubSentimentData[] | undefined,
  twitter: FinnhubSentimentData[] | undefined
): { score: number; mentions: number } {
  const redditLatest = reddit?.[reddit.length - 1];
  const twitterLatest = twitter?.[twitter.length - 1];

  const redditMentions = redditLatest?.mention ?? 0;
  const twitterMentions = twitterLatest?.mention ?? 0;
  const totalMentions = redditMentions + twitterMentions;

  if (totalMentions === 0) {
    return { score: 0.5, mentions: 0 };  // Neutral if no data
  }

  // Weighted average by mention count
  const redditWeight = redditMentions / totalMentions;
  const twitterWeight = twitterMentions / totalMentions;

  const score =
    (redditLatest?.score ?? 0.5) * redditWeight +
    (twitterLatest?.score ?? 0.5) * twitterWeight;

  return { score, mentions: totalMentions };
}

function getSentimentLabel(score: number): "bullish" | "bearish" | "neutral" {
  if (score >= 0.6) return "bullish";
  if (score <= 0.4) return "bearish";
  return "neutral";
}
```

### 7. Normalize Implementation

Map sentiment data to `ContentItemDraft`:

- `sourceType`: `"market_sentiment"`
- `externalId`: `ms_{ticker}_{date}` (date = YYYY-MM-DD)
- `canonicalUrl`: `https://finnhub.io/` (no specific page per ticker)
- `title`: `{Ticker} sentiment: {Label} ({score})`
  - Example: `AAPL sentiment: Bullish (0.72)`
  - With change: `AAPL sentiment: Bullish (0.72, +15% from yesterday)`
- `bodyText`: Mention counts, breakdown by source, comparison to previous period
- `publishedAt`: Data timestamp from API
- `author`: `"Finnhub Social Sentiment"`
- `metadata`:
  - `ticker`: Stock ticker
  - `sentiment_score`: Composite score (0-1)
  - `sentiment_label`: `"bullish"` | `"bearish"` | `"neutral"`
  - `is_extreme`: Boolean, true if score > extreme_threshold or < (1 - extreme_threshold)
  - `total_mentions`: Total mention count
  - `positive_mentions`: Positive mention count
  - `negative_mentions`: Negative mention count
  - `neutral_mentions`: Neutral mention count
  - `reddit_score`: Reddit-specific score (or null)
  - `reddit_mentions`: Reddit mention count
  - `twitter_score`: Twitter-specific score (or null)
  - `twitter_mentions`: Twitter mention count
  - `previous_score`: Score from last fetch (for change calculation)
  - `score_change`: Percentage change from previous fetch
  - `data_timestamp`: Original timestamp from Finnhub

### 8. Title Generation

```typescript
function generateTitle(sentiment: AggregatedSentiment, previousScore?: number): string {
  const label = sentiment.sentimentLabel.charAt(0).toUpperCase() +
                sentiment.sentimentLabel.slice(1);
  const scoreStr = sentiment.compositeScore.toFixed(2);

  if (previousScore !== undefined) {
    const change = ((sentiment.compositeScore - previousScore) / previousScore) * 100;
    if (Math.abs(change) >= 5) {
      const changeStr = change > 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`;
      return `${sentiment.ticker} sentiment: ${label} (${scoreStr}, ${changeStr} change)`;
    }
  }

  return `${sentiment.ticker} sentiment: ${label} (${scoreStr})`;
}
```

### 9. Cursor Schema

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "ticker_scores": {
    "AAPL": { "score": 0.65, "mentions": 650, "fetched_at": "2025-01-07T08:00:00Z" },
    "TSLA": { "score": 0.58, "mentions": 1200, "fetched_at": "2025-01-07T08:00:00Z" }
  }
}
```

Track previous scores to calculate changes and apply threshold filtering.

### 10. Rate Limiting

Finnhub free tier limits:
- 60 API calls per minute
- Some premium endpoints restricted
- Implement request counting with minute-based reset
- Add delay between requests (minimum 1 second)
- Back off on 429 responses

### 11. Error Handling

Handle common scenarios:
- `401`: Invalid API key
- `403`: Premium endpoint or rate limit exceeded
- `429`: Rate limited - back off and retry
- `500/503`: Service temporarily unavailable
- No data for ticker: Skip and continue
- Empty response: Log and return no items

## Files to Create

- `packages/connectors/src/market_sentiment/config.ts`
- `packages/connectors/src/market_sentiment/fetch.ts`
- `packages/connectors/src/market_sentiment/normalize.ts`
- `packages/connectors/src/market_sentiment/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "market_sentiment" to SourceType)
- `packages/connectors/src/index.ts` (register market_sentiment connector)
- `packages/connectors/src/registry.ts` (add to registry)
- `.env.example` (add FINNHUB_API_KEY)
- `docs/connectors.md` (add Market Sentiment spec)

## Dependencies

```bash
# No additional dependencies required
# Uses built-in fetch API
```

## Limitations to Document

Document these limitations in `docs/connectors.md`:

1. **Noisy signal** - Social sentiment has limited predictive value
2. **Lagging indicator** - By the time sentiment is measurable, price may have moved
3. **Ticker coverage** - Not all tickers have sufficient social data
4. **Rate limits** - Free tier limits restrict monitoring many tickers
5. **Data quality** - Sentiment analysis accuracy varies

## Out of Scope

- Real-time sentiment streaming
- Custom NLP/sentiment analysis
- News sentiment (separate endpoint, may be premium)
- Earnings call sentiment
- Insider sentiment tracking
- Correlation with price movements

## Whale Alerts Note

**Do NOT create a separate whale alert connector.** For on-chain whale alerts:

1. Use the Telegram connector (Task 085)
2. Add `@whale_alert_io` channel to Telegram source config
3. Whale Alert Telegram channel is free and provides real-time on-chain alerts

Example Telegram source for whale alerts:
```json
{
  "channels": ["@whale_alert_io"],
  "max_messages_per_channel": 50,
  "include_media_captions": true
}
```

## Test Plan

```bash
pnpm typecheck

# Set up API key
export FINNHUB_API_KEY=your_key

# Add a market sentiment source (major indices)
pnpm dev -- admin:sources-add --type market_sentiment --name "sentiment:indices" --config '{"tickers":["SPY","QQQ"],"min_mentions":100}'

# Add a filtered source (tech stocks with change threshold)
pnpm dev -- admin:sources-add --type market_sentiment --name "sentiment:tech-movers" --config '{"tickers":["AAPL","TSLA","NVDA"],"sentiment_change_threshold":10}'

# Fetch sentiment data
pnpm dev -- admin:run-now --source-type market_sentiment --max-items-per-source 10

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add market sentiment source with ticker list
- [ ] Can add market sentiment source with change threshold
- [ ] Fetch returns sentiment data for configured tickers
- [ ] Composite score calculated from Reddit + Twitter
- [ ] Sentiment label (bullish/bearish/neutral) assigned correctly
- [ ] Change threshold filter works
- [ ] Rate limiting respected (60 req/min)
- [ ] Graceful error handling for API issues
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (tracks previous scores for change detection)

## Commit

- **Message**: `feat(market-sentiment): add Finnhub social sentiment connector`
- **Files expected**: See "Files to Create/Modify" sections
