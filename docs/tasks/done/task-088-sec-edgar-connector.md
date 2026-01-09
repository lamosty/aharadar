# Task 088: SEC EDGAR Connector for Insider Trading and Institutional Holdings

## Priority: High

## Goal

Add an SEC EDGAR connector to fetch insider trading filings (Form 4) and institutional holdings (13F) from the SEC's free public API.

## Background

SEC EDGAR is the official database for U.S. securities filings. Form 4 filings show insider buys/sells in real-time, while 13F filings reveal institutional holdings quarterly. This data is freely available via the SEC's public API with no authentication required.

## Read First

- `docs/connectors.md` (connector contracts)
- `packages/connectors/src/reddit/*.ts` (reference implementation)
- SEC EDGAR API docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- SEC Developer Resources: https://www.sec.gov/developer

## Prerequisites

None - SEC EDGAR API is free and requires no authentication. However, requests must include a valid User-Agent header with contact information per SEC guidelines.

## Scope

### 1. Create Connector Directory

Create `packages/connectors/src/sec_edgar/`:

- `config.ts` - Parse and validate config
- `fetch.ts` - Fetch filings via SEC API
- `normalize.ts` - Map filings to ContentItemDraft
- `index.ts` - Exports

### 2. Config Schema

```json
{
  "filing_types": ["form4", "13f"],
  "tickers": ["AAPL", "TSLA"],
  "ciks": ["0000320193"],
  "min_transaction_value": 100000,
  "max_filings_per_fetch": 50
}
```

Fields:

- `filing_types` (required): Array of `"form4"` and/or `"13f"`
- `tickers` (optional): Filter by company ticker symbols
- `ciks` (optional): Filter by CIK numbers (more precise than tickers)
- `min_transaction_value` (default: 0): Minimum transaction value in USD (Form 4 only)
- `max_filings_per_fetch` (default: 50, clamp 1-100): Max filings per fetch

### 3. Environment Variable

Add User-Agent contact info to `.env.example`:

```
SEC_EDGAR_USER_AGENT=AhaRadar/1.0 (contact@example.com)
```

### 4. Fetch Implementation

`packages/connectors/src/sec_edgar/fetch.ts`:

**API Endpoints:**

1. **Company Submissions** (get all filings for a company):

   ```
   https://data.sec.gov/submissions/CIK{cik}.json
   ```

2. **Full-Text Search** (search recent filings):

   ```
   https://efts.sec.gov/LATEST/search-index?q=*&dateRange=custom&startdt=2025-01-01&enddt=2025-01-08&forms=4
   ```

3. **RSS Feeds** (real-time updates):
   - Form 4: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom`
   - 13F: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F&company=&dateb=&owner=include&count=100&output=atom`

**Recommended MVP approach:**

- Use RSS feeds for real-time Form 4 and 13F filing notifications
- Parse the Atom XML to get filing URLs
- Fetch individual filing details from the submission JSON endpoint
- For Form 4, parse the XML filing to extract transaction details

### 5. Filing Parsing

**Form 4 XML Structure:**

- Located at: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/primary_doc.xml`
- Contains: `reportingOwner`, `issuer`, `nonDerivativeTransaction`, `derivativeTransaction`
- Transaction codes: P (purchase), S (sale), A (award), D (disposition), etc.

**13F XML Structure:**

- Located at: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/infotable.xml`
- Contains: `infoTable` with holdings positions

### 6. Normalize Implementation

Map SEC filing to `ContentItemDraft`:

**Form 4 (Insider Trading):**

- `sourceType`: `"sec_edgar"`
- `externalId`: `form4_{accession_number}`
- `canonicalUrl`: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=4&dateb=&owner=include&count=40`
- `title`: `[BUY/SELL] {Insider Name} - {Company} - ${Amount}`
- `bodyText`: Transaction details including insider role, shares, price, and value
- `publishedAt`: Filing date (ISO)
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

**13F (Institutional Holdings):**

- `sourceType`: `"sec_edgar"`
- `externalId`: `13f_{accession_number}`
- `canonicalUrl`: Filing URL on SEC
- `title`: `[13F] {Institution Name} - Q{Quarter} {Year} Holdings`
- `bodyText`: Summary of notable positions and changes
- `publishedAt`: Filing date (ISO)
- `author`: Institution name
- `metadata`:
  - `filing_type`: `"13f"`
  - `institution_name`: Name of institution
  - `cik`: Institution CIK
  - `report_period`: Quarter end date
  - `total_value`: Total portfolio value
  - `holdings_count`: Number of positions
  - `top_holdings`: Array of top 10 positions with ticker, shares, value

### 7. Cursor Schema

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

### 8. Rate Limiting

SEC EDGAR has rate limits:

- Maximum 10 requests per second
- Include User-Agent header with contact info
- Implement exponential backoff on 429 responses

Add delay between requests (minimum 100ms).

### 9. Error Handling

Handle common scenarios:

- `404`: Filing not found or CIK invalid
- `429`: Rate limited - back off and retry
- `503`: Service temporarily unavailable
- Malformed XML: Log and skip filing

## Files to Create

- `packages/connectors/src/sec_edgar/config.ts`
- `packages/connectors/src/sec_edgar/fetch.ts`
- `packages/connectors/src/sec_edgar/normalize.ts`
- `packages/connectors/src/sec_edgar/parse.ts` (Form 4 and 13F XML parsing)
- `packages/connectors/src/sec_edgar/index.ts`

## Files to Modify

- `packages/shared/src/types/connector.ts` (add "sec_edgar" to SourceType)
- `packages/connectors/src/index.ts` (register sec_edgar connector)
- `packages/connectors/src/registry.ts` (add to registry)
- `.env.example` (add SEC_EDGAR_USER_AGENT)
- `docs/connectors.md` (add SEC EDGAR spec)

## Dependencies

```bash
# fast-xml-parser already used by RSS connector
# No additional dependencies required
```

## Out of Scope

- Historical filing analysis (bulk downloads)
- 10-K, 10-Q, 8-K parsing (future connectors)
- Automatic ticker-to-CIK resolution (use CIK lookup manually)
- Filing amendments reconciliation

## Test Plan

```bash
pnpm typecheck

# Add a SEC EDGAR source (Form 4 for Apple)
pnpm dev -- admin:sources-add --type sec_edgar --name "sec:aapl-insiders" --config '{"filing_types":["form4"],"ciks":["0000320193"]}'

# Add a 13F source (major institutions)
pnpm dev -- admin:sources-add --type sec_edgar --name "sec:13f-filings" --config '{"filing_types":["13f"],"max_filings_per_fetch":20}'

# Fetch filings
pnpm dev -- admin:run-now --source-type sec_edgar --max-items-per-source 20

# Verify items
pnpm dev -- inbox --table
```

## Acceptance Criteria

- [ ] Can add SEC EDGAR source with Form 4 config
- [ ] Can add SEC EDGAR source with 13F config
- [ ] Fetch returns Form 4 filings with transaction details
- [ ] Fetch returns 13F filings with holdings summary
- [ ] Transaction value filter works for Form 4
- [ ] Rate limiting respected (max 10 req/sec)
- [ ] Graceful error handling for missing/invalid filings
- [ ] `pnpm typecheck` passes
- [ ] Cursoring works (re-run fetches only new filings)
- [ ] User-Agent header included with contact info

## Commit

- **Message**: `feat(sec-edgar): add SEC EDGAR connector for Form 4 and 13F filings`
- **Files expected**: See "Files to Create/Modify" sections
