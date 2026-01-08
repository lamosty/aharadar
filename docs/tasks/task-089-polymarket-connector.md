# Task 089: Polymarket Connector for Prediction Market Data

## Priority: High

## Goal

Add a Polymarket connector to fetch prediction market data including market questions, probabilities, volume, and price movements from the free public API.

## Background

Polymarket is a leading prediction market platform where users bet on outcomes of real-world events. Market probabilities often serve as crowd-sourced forecasts for political, economic, and other events. The API is free and open, providing valuable signal data.

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- Polymarket API docs: https://docs.polymarket.com/
- Polymarket Gamma API: https://gamma-api.polymarket.com/

## Prerequisites

None - Polymarket API is free and requires no authentication for public market data.

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/polymarket/`:
- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch markets via API
- `normalize.ts` - Map markets to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

```json
{
  "categories": ["politics", "economics", "crypto", "sports", "science"],
  "min_volume": 10000,
  "min_liquidity": 5000,
  "probability_change_threshold": 5,
  "include_resolved": false,
  "max_markets_per_fetch": 50
}
```

Fields:
- `categories` (optional): Filter by market categories
- `min_volume` (default: 0): Minimum total volume in USD
- `min_liquidity` (default: 0): Minimum current liquidity
- `probability_change_threshold` (default: 0): Only include markets with 24h probability change >= this percentage
- `include_resolved` (default: false): Include resolved markets
- `max_markets_per_fetch` (default: 50, clamp 1-200): Max markets per fetch

### 3. API Endpoints

**Gamma API (Primary):**

1. **List Markets:**
   ```
   GET https://gamma-api.polymarket.com/markets
   ?limit=100
   &active=true
   &closed=false
   ```

2. **Market Details:**
   ```
   GET https://gamma-api.polymarket.com/markets/{condition_id}
   ```

3. **Market Events:**
   ```
   GET https://gamma-api.polymarket.com/events
   ```

**CLOB API (Order Book Data):**
   ```
   GET https://clob.polymarket.com/markets/{token_id}
   ```

### 4. Fetch Implementation

`packages/connectors/src/polymarket/fetch.ts`:

```typescript
interface PolymarketRawMarket {
  condition_id: string;
  question: string;
  description: string;
  category: string;
  end_date_iso: string;
  outcomes: string[];
  outcome_prices: string[];  // Current probabilities as strings "0.65"
  volume: string;
  liquidity: string;
  spread: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  created_at: string;
  accepting_orders: boolean;
  // Price history for change calculation
  price_change_24h?: number;
}
```

**Fetch Logic:**
1. Call `/markets` endpoint with filters
2. Parse response and apply local filters (min_volume, category, etc.)
3. Calculate 24h probability change where available
4. Return markets matching criteria

### 5. Normalize Implementation

Map Polymarket market to `ContentItemDraft`:

- `sourceType`: `"polymarket"`
- `externalId`: `pm_{condition_id}`
- `canonicalUrl`: `https://polymarket.com/event/{slug}` or `https://polymarket.com/market/{condition_id}`
- `title`: `{Question} - Now {X}% (was {Y}%)`
  - If no significant change: `{Question} - {X}%`
- `bodyText`: Market description, volume stats, recent movement summary
- `publishedAt`: Market creation date or last significant update
- `author`: `"Polymarket"`
- `metadata`:
  - `condition_id`: Market condition ID
  - `question`: Full market question
  - `category`: Market category
  - `probability`: Current probability (decimal 0-1)
  - `probability_24h_ago`: Probability 24h ago (if available)
  - `probability_change`: 24h change in percentage points
  - `volume`: Total volume in USD
  - `liquidity`: Current liquidity
  - `spread`: Bid-ask spread
  - `outcomes`: Array of outcome names
  - `outcome_prices`: Array of outcome probabilities
  - `end_date`: Market resolution date
  - `is_active`: Whether market is accepting trades
  - `resolution_status`: `"open"` | `"resolved"` | `"cancelled"`

### 6. Title Generation Logic

Generate informative titles based on market state:

```typescript
function generateTitle(market: PolymarketRawMarket): string {
  const prob = parseFloat(market.outcome_prices[0]) * 100;
  const change = market.price_change_24h ?? 0;

  if (Math.abs(change) >= 5) {
    const direction = change > 0 ? "+" : "";
    return `${market.question} - ${prob.toFixed(0)}% (${direction}${change.toFixed(0)}% 24h)`;
  }

  return `${market.question} - ${prob.toFixed(0)}%`;
}
```

### 7. Cursor Schema

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "seen_condition_ids": ["id1", "id2", "id3"],
  "last_prices": {
    "condition_id_1": 0.65,
    "condition_id_2": 0.42
  }
}
```

Note: Track `last_prices` to calculate local 24h change if API doesn't provide it.

### 8. Significant Movement Detection

To surface markets with significant probability movements:

1. Store previous fetch probabilities in cursor
2. On each fetch, compare current vs stored probabilities
3. Emit item only if change >= `probability_change_threshold`
4. Always emit newly discovered markets

This allows the connector to act as a "prediction market alert" system.

### 9. Rate Limiting

Polymarket API limits are not strictly documented. Implement conservative limits:
- Maximum 5 requests per second
- Implement exponential backoff on 429 responses
- Cache market metadata where possible

### 10. Error Handling

Handle common scenarios:
- `404`: Market not found or removed
- `429`: Rate limited - back off and retry
- `500/503`: Service temporarily unavailable
- Invalid JSON: Log and skip response

## Files to Create

- `packages/connectors/src/polymarket/config.ts`
- `packages/connectors/src/polymarket/fetch.ts`
- `packages/connectors/src/polymarket/normalize.ts`
- `packages/connectors/src/polymarket/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "polymarket" to SourceType)
- `packages/connectors/src/index.ts` (register polymarket connector)
- `packages/connectors/src/registry.ts` (add to registry)
- `docs/connectors.md` (add Polymarket spec)

## Dependencies

```bash
# No additional dependencies required
# Uses built-in fetch API
```

## Out of Scope

- Order book depth analysis
- Trading/betting functionality
- Historical price charts
- User portfolio tracking
- Real-time websocket updates
- CLOB API integration (order book data)

## Test Plan

```bash
pnpm typecheck

# Add a Polymarket source (all active markets)
pnpm dev -- admin:sources-add --type polymarket --name "pm:all" --config '{"min_volume":10000}'

# Add a filtered source (politics only, significant moves)
pnpm dev -- admin:sources-add --type polymarket --name "pm:politics-movers" --config '{"categories":["politics"],"probability_change_threshold":5}'

# Fetch markets
pnpm dev -- admin:run-now --source-type polymarket --max-items-per-source 30

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add Polymarket source with category filter
- [ ] Can add Polymarket source with volume filter
- [ ] Fetch returns active markets with probabilities
- [ ] Probability change threshold filter works
- [ ] Market titles include probability and change info
- [ ] Rate limiting respected
- [ ] Graceful error handling for API issues
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (tracks seen markets, price changes)

## Commit

- **Message**: `feat(polymarket): add Polymarket prediction market connector`
- **Files expected**: See "Files to Create/Modify" sections
