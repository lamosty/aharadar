# Task 092: Options Flow Connector via Unusual Whales API

## Priority: Medium

## Goal

Add an options flow connector to fetch unusual options activity, sweeps, and large orders using the Unusual Whales public API (free tier).

## Background

Options flow often leads stock price movements. Large call/put sweeps can indicate institutional conviction before news breaks. This data complements textual sources (Reddit, Twitter, news) for identifying corroborating signals.

Key terms:
- **Sweep**: Market order split across multiple exchanges to fill quickly (usually indicates urgency/conviction)
- **Block**: Large privately negotiated order
- **Unusual activity**: Volume significantly higher than normal for that contract

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- Unusual Whales Public API: https://unusualwhales.com/public-api
- Free tier documentation (verify current limits)

## Prerequisites

1. Sign up for free Unusual Whales account
2. Obtain API key/access for public API
3. Verify free tier rate limits and data coverage

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/options_flow/`:
- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch options flow via API
- `normalize.ts` - Map flow data to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

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

Fields:
- `symbols` (optional): Filter by specific tickers (empty = all)
- `min_premium` (default: 50000): Minimum order premium in USD
- `flow_types` (default: all): Array of `"sweep"`, `"block"`, `"unusual"`
- `sentiment_filter` (optional): `"bullish"` | `"bearish"` | null
- `include_etfs` (default: true): Include ETF options (SPY, QQQ, etc.)
- `expiry_max_days` (default: 90): Max days to expiration (filter out LEAPs if desired)
- `max_alerts_per_fetch` (default: 50, clamp 1-100): Max alerts per fetch

### 3. Environment Variable

Add API key to `.env.example`:

```
UNUSUAL_WHALES_API_KEY=your_api_key_here
```

### 4. API Integration

**Unusual Whales Public API** (verify endpoints - may vary):

```
GET https://api.unusualwhales.com/api/flow
Authorization: Bearer {api_key}

Query params (likely):
- symbols: comma-separated tickers
- min_premium: minimum premium
- flow_type: sweep/block/unusual
```

**Alternative/Fallback**: If Unusual Whales API is limited:
- Consider web scraping InsiderFinance (https://www.insiderfinance.io/flow)
- Or use Twitter @unusual_whales, @SweepCast via Signal connector

### 5. Data Model

```typescript
interface OptionsFlowRaw {
  id: string;
  symbol: string;
  strike: number;
  expiry: string;           // YYYY-MM-DD
  contract_type: "call" | "put";
  flow_type: "sweep" | "block" | "unusual";
  sentiment: "bullish" | "bearish" | "neutral";
  premium: number;          // Total premium in USD
  volume: number;           // Number of contracts
  open_interest: number;    // Prior open interest
  spot_price: number;       // Underlying price at time of order
  timestamp: string;        // ISO timestamp
  exchange?: string;        // Exchange(s) where executed
}
```

### 6. Normalize Implementation

Map options flow to `ContentItemDraft`:

- `sourceType`: `"options_flow"`
- `externalId`: `of_{id}` or `of_{symbol}_{strike}_{expiry}_{timestamp}`
- `canonicalUrl`: Link to Unusual Whales or constructed URL
- `title`: `[{FLOW_TYPE}] ${SYMBOL} ${STRIKE}{C/P} {EXPIRY} - ${PREMIUM} ({SENTIMENT})`
  - Example: `[SWEEP] $AAPL $180C 1/17 - $2.1M (Bullish)`
- `bodyText`: Details including volume, OI comparison, spot price, time to expiry
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
  - `volume_oi_ratio`: volume / open_interest (high = unusual)
  - `spot_price`: Underlying price at order time
  - `days_to_expiry`: Days until expiration
  - `is_weekly`: Boolean (weekly options)
  - `is_otm`: Boolean (out of the money)

### 7. Title Generation

```typescript
function generateTitle(flow: OptionsFlowRaw): string {
  const flowType = flow.flow_type.toUpperCase();
  const contractType = flow.contract_type === "call" ? "C" : "P";
  const premium = formatPremium(flow.premium); // e.g., "$2.1M"
  const sentiment = flow.sentiment.charAt(0).toUpperCase() + flow.sentiment.slice(1);
  const expiry = formatExpiry(flow.expiry); // e.g., "1/17"

  return `[${flowType}] $${flow.symbol} $${flow.strike}${contractType} ${expiry} - ${premium} (${sentiment})`;
}

function formatPremium(premium: number): string {
  if (premium >= 1_000_000) return `$${(premium / 1_000_000).toFixed(1)}M`;
  if (premium >= 1000) return `$${(premium / 1000).toFixed(0)}K`;
  return `$${premium}`;
}
```

### 8. Cursor Schema

```json
{
  "last_fetch_at": "2025-01-08T14:30:00Z",
  "last_seen_id": "flow_12345",
  "seen_ids": ["flow_12340", "flow_12341", "flow_12342"]
}
```

### 9. Sentiment Classification

If API doesn't provide sentiment, classify locally:

```typescript
function classifySentiment(flow: OptionsFlowRaw): "bullish" | "bearish" | "neutral" {
  const isCall = flow.contract_type === "call";
  const isOTM = isCall
    ? flow.strike > flow.spot_price
    : flow.strike < flow.spot_price;

  // Sweeps on OTM calls = bullish
  // Sweeps on OTM puts = bearish
  // ITM options are more complex (could be hedging)

  if (flow.flow_type === "sweep") {
    if (isCall && isOTM) return "bullish";
    if (!isCall && isOTM) return "bearish";
  }

  return "neutral";
}
```

### 10. Rate Limiting

Unusual Whales limits (verify current):
- Free tier: Limited requests per day (check documentation)
- Implement request counting with daily reset
- Add delay between requests
- Back off on 429 responses

### 11. Error Handling

Handle common scenarios:
- `401`: Invalid or expired API key
- `403`: Free tier limit exceeded
- `429`: Rate limited - back off and retry
- `500/503`: Service temporarily unavailable
- Empty response: No flow matching criteria

## Files to Create

- `packages/connectors/src/options_flow/config.ts`
- `packages/connectors/src/options_flow/fetch.ts`
- `packages/connectors/src/options_flow/normalize.ts`
- `packages/connectors/src/options_flow/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "options_flow" to SourceType)
- `packages/connectors/src/index.ts` (register options_flow connector)
- `packages/connectors/src/registry.ts` (add to registry)
- `.env.example` (add UNUSUAL_WHALES_API_KEY)
- `docs/connectors.md` (add Options Flow spec)

## Dependencies

```bash
# No additional dependencies required
# Uses built-in fetch API
```

## Out of Scope

- Real-time websocket streaming
- Historical options data analysis
- Options pricing/Greeks calculation
- Trading execution
- Dark pool order flow (requires expensive data)
- Individual contract tracking over time

## Test Plan

```bash
pnpm typecheck

# Set up API key
export UNUSUAL_WHALES_API_KEY=your_key

# Add an options flow source (major stocks)
pnpm dev -- admin:sources-add --type options_flow --name "flow:major" --config '{"symbols":["SPY","QQQ","AAPL","NVDA"],"min_premium":100000}'

# Add a filtered source (sweeps only, bullish)
pnpm dev -- admin:sources-add --type options_flow --name "flow:bullish-sweeps" --config '{"flow_types":["sweep"],"sentiment_filter":"bullish","min_premium":500000}'

# Fetch flow data
pnpm dev -- admin:run-now --source-type options_flow --max-items-per-source 30

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add options flow source with symbol filter
- [ ] Can add options flow source with premium filter
- [ ] Can add options flow source with flow type filter
- [ ] Fetch returns flow data with contract details
- [ ] Sentiment classification works (bullish/bearish/neutral)
- [ ] Titles are informative: `[SWEEP] $AAPL $180C 1/17 - $2.1M (Bullish)`
- [ ] Rate limiting respected
- [ ] Graceful error handling for API issues
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (tracks seen flow IDs)

## Commit

- **Message**: `feat(options-flow): add options flow connector via Unusual Whales API`
- **Files expected**: See "Files to Create/Modify" sections

## Future Enhancement: Signal Correlation (Optional/Experimental)

Once this connector and other financial data sources (Tasks 088-091) are working, a future enhancement could add automatic correlation detection:

During triage/enrichment, pass cluster content + recent options flow to Claude:
```
Cluster: "Venezuela tensions discussion"
Recent flow: "Large put sweeps on $XOM, $HAL"
→ Claude identifies correlation and flags it
```

This leverages the LLM's knowledge (e.g., knowing XOM/HAL have Venezuela exposure) without building complex entity mapping.

**Implementation notes:**
- **Off by default** - opt-in via config flag
- **Budget-aware** - only runs when budget tier allows
- **Model selection** - use cheap model (Haiku) for correlation check
- **Local-only initially** - test with Claude Code subscription before enabling for API usage

```typescript
// Example config
{
  "experimental": {
    "signal_correlation": false,  // Off by default
    "correlation_model": "haiku"  // Cheap model when enabled
  }
}
```

Deferred until data foundation is solid. Build → ship off → test locally → measure value → decide.
