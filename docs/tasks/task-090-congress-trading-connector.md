# Task 090: Congress Trading Connector via Quiver Quantitative

## Priority: High

## Goal

Add a Congress trading connector to fetch stock trades disclosed by U.S. Congress members using the Quiver Quantitative free tier API.

## Background

Members of Congress are required to disclose stock trades within 45 days. These disclosures are public record and can provide insight into potential market-moving information. Quiver Quantitative aggregates this data into an accessible API with a free tier.

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- Quiver Quantitative Congress Trading: https://www.quiverquant.com/congresstrading/
- Quiver API docs: https://www.quiverquant.com/api/

## Prerequisites

1. Sign up for free Quiver Quantitative account
2. Obtain API key from dashboard
3. Free tier limits: ~100 requests/day (verify current limits)

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/congress_trading/`:
- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch trades via Quiver API
- `normalize.ts` - Map trades to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

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

Fields:
- `politicians` (optional): Filter by specific politicians (case-insensitive match)
- `chambers` (optional, default: both): `"senate"` and/or `"house"`
- `min_amount` (default: 0): Minimum transaction amount (lower bound of range)
- `transaction_types` (optional, default: both): `"purchase"` and/or `"sale"`
- `tickers` (optional): Filter by specific stock tickers
- `max_trades_per_fetch` (default: 50, clamp 1-100): Max trades per fetch

### 3. Environment Variable

Add API key to `.env.example`:

```
QUIVER_API_KEY=your_quiver_api_key_here
```

### 4. API Endpoints

**Quiver Quantitative API:**

1. **Congress Trading (Recent):**
   ```
   GET https://api.quiverquant.com/beta/live/congresstrading
   Authorization: Bearer {api_key}
   ```

2. **Historical by Ticker:**
   ```
   GET https://api.quiverquant.com/beta/historical/congresstrading/{ticker}
   Authorization: Bearer {api_key}
   ```

**Alternative Free Sources (if Quiver unavailable):**
- House Stock Watcher: https://housestockwatcher.com/api
- Senate Stock Watcher: https://senatestockwatcher.com/api

### 5. Fetch Implementation

`packages/connectors/src/congress_trading/fetch.ts`:

```typescript
interface QuiverCongressTrade {
  Representative: string;
  BioGuideId: string;
  District: string;  // e.g., "CA-12" or "TX-Sen"
  Party: string;     // "D" | "R" | "I"
  Ticker: string;
  Asset: string;     // Full asset description
  Transaction: string;  // "Purchase" | "Sale" | "Exchange"
  Range: string;     // "$1,001 - $15,000" | "$15,001 - $50,000" etc.
  Date: string;      // Transaction date
  ReportDate: string;  // Filing date
  Link: string;      // Link to disclosure
}
```

**Fetch Logic:**
1. Call `/beta/live/congresstrading` endpoint
2. Parse response and apply local filters (politician, chamber, amount, etc.)
3. Determine chamber from District field (contains "-Sen" for Senate)
4. Parse amount range to get min/max values
5. Return trades matching criteria

### 6. Amount Range Parsing

Congress disclosures use ranges, not exact amounts:

```typescript
const AMOUNT_RANGES: Record<string, { min: number; max: number }> = {
  "$1,001 - $15,000": { min: 1001, max: 15000 },
  "$15,001 - $50,000": { min: 15001, max: 50000 },
  "$50,001 - $100,000": { min: 50001, max: 100000 },
  "$100,001 - $250,000": { min: 100001, max: 250000 },
  "$250,001 - $500,000": { min: 250001, max: 500000 },
  "$500,001 - $1,000,000": { min: 500001, max: 1000000 },
  "$1,000,001 - $5,000,000": { min: 1000001, max: 5000000 },
  "$5,000,001 - $25,000,000": { min: 5000001, max: 25000000 },
  "$25,000,001 - $50,000,000": { min: 25000001, max: 50000000 },
  "Over $50,000,000": { min: 50000001, max: Infinity },
};

function parseAmountRange(range: string): { min: number; max: number } {
  return AMOUNT_RANGES[range] ?? { min: 0, max: 0 };
}
```

### 7. Normalize Implementation

Map Congress trade to `ContentItemDraft`:

- `sourceType`: `"congress_trading"`
- `externalId`: `ct_{bioguide_id}_{ticker}_{date}_{transaction_type}` (composite key)
- `canonicalUrl`: Disclosure link or `https://www.quiverquant.com/congresstrading/`
- `title`: `[{Chamber}] {Politician} ({Party}) {BUY/SELL} {Ticker}`
  - Example: `[House] Nancy Pelosi (D) BUY NVDA`
- `bodyText`: Full asset description, amount range, transaction and report dates, district/state info
- `publishedAt`: Report date (filing date, not transaction date)
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
  - `amount_range`: Original range string
  - `amount_min`: Minimum amount (parsed)
  - `amount_max`: Maximum amount (parsed)
  - `transaction_date`: Date of transaction
  - `report_date`: Date of disclosure filing
  - `days_to_disclose`: Days between transaction and report

### 8. Title Generation

```typescript
function generateTitle(trade: QuiverCongressTrade): string {
  const chamber = trade.District.includes("-Sen") ? "Senate" : "House";
  const action = trade.Transaction === "Purchase" ? "BUY" :
                 trade.Transaction === "Sale" ? "SELL" : trade.Transaction.toUpperCase();

  return `[${chamber}] ${trade.Representative} (${trade.Party}) ${action} ${trade.Ticker}`;
}
```

### 9. Cursor Schema

```json
{
  "last_fetch_at": "2025-01-08T08:00:00Z",
  "last_report_date": "2025-01-07",
  "seen_trade_ids": ["ct_P000197_NVDA_2025-01-02_purchase"]
}
```

### 10. Rate Limiting

Quiver free tier limits:
- ~100 requests per day (verify current limits)
- Implement request counting and daily reset
- Cache responses where possible
- Back off on 429 responses

### 11. Error Handling

Handle common scenarios:
- `401`: Invalid or expired API key
- `403`: Free tier limit exceeded
- `429`: Rate limited - back off and retry
- `500/503`: Service temporarily unavailable
- Empty response: No new trades

## Files to Create

- `packages/connectors/src/congress_trading/config.ts`
- `packages/connectors/src/congress_trading/fetch.ts`
- `packages/connectors/src/congress_trading/normalize.ts`
- `packages/connectors/src/congress_trading/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "congress_trading" to SourceType)
- `packages/connectors/src/index.ts` (register congress_trading connector)
- `packages/connectors/src/registry.ts` (add to registry)
- `.env.example` (add QUIVER_API_KEY)
- `docs/connectors.md` (add Congress Trading spec)

## Dependencies

```bash
# No additional dependencies required
# Uses built-in fetch API
```

## Alternative Data Sources

If Quiver API is unavailable or too limited, consider these alternatives:

1. **House Stock Watcher API** (free, no auth):
   ```
   GET https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json
   ```

2. **Senate Stock Watcher API** (free, no auth):
   ```
   GET https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json
   ```

These are S3-hosted JSON files updated regularly. Consider implementing as fallback.

## Out of Scope

- Historical trade analysis
- Performance tracking (did the trade beat the market?)
- Automatic correlation with news events
- Committee membership data
- Lobbying disclosure integration
- Real-time alerts (data has inherent delay)

## Test Plan

```bash
pnpm typecheck

# Set up API key
export QUIVER_API_KEY=your_key

# Add a Congress trading source (all trades)
pnpm dev -- admin:sources-add --type congress_trading --name "congress:all" --config '{"min_amount":15000}'

# Add a filtered source (specific politicians)
pnpm dev -- admin:sources-add --type congress_trading --name "congress:pelosi" --config '{"politicians":["Nancy Pelosi"]}'

# Fetch trades
pnpm dev -- admin:run-now --source-type congress_trading --max-items-per-source 20

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add Congress trading source with politician filter
- [ ] Can add Congress trading source with chamber filter
- [ ] Can add Congress trading source with amount filter
- [ ] Fetch returns trade disclosures with parsed details
- [ ] Amount range parsing works correctly
- [ ] Chamber detection works (House vs Senate)
- [ ] Rate limiting respected
- [ ] Graceful error handling for API issues
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (tracks seen trades by composite ID)

## Commit

- **Message**: `feat(congress-trading): add Congress trading connector via Quiver Quantitative`
- **Files expected**: See "Files to Create/Modify" sections
