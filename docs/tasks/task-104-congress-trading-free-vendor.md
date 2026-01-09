# Task 104 — `feat(connectors,web): congress_trading free vendor default + paid vendor opt-in`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human

### Goal

Make `congress_trading` usable without paid APIs by defaulting to free, no-auth public disclosure feeds (House/Senate Stock Watcher), while keeping Quiver as an explicit opt-in vendor for users who have a paid API key.

### Read first (contracts + code)

- `AGENTS.md` (repo invariants: topic-agnostic; provider-agnostic; no ToS violations)
- `docs/connectors.md` (connector contracts)
- `docs/spec.md` (topic-agnostic product)
- `docs/tasks/done/task-090-congress-trading-connector.md` (prior design notes + alternative endpoints)
- `packages/connectors/src/congress_trading/*`
- `packages/web/src/components/SourceConfigForms/CongressTradingConfigForm.tsx`
- `packages/web/src/components/ApiKeyGuidance/ApiKeyGuidance.tsx`

### Scope (allowed files)

- `packages/connectors/src/congress_trading/config.ts`
- `packages/connectors/src/congress_trading/fetch.ts`
- `packages/connectors/src/congress_trading/normalize.ts`
- `docs/connectors.md`
- `packages/web/src/components/SourceConfigForms/CongressTradingConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx`
- `packages/web/src/components/ApiKeyGuidance/ApiKeyGuidance.tsx`

If anything else seems required, **stop and ask** before changing.

### Decisions (record Driver answers in this section before implementation)

- **Default vendor**: **`stock_watcher`** (free public feeds). ✅ decided
- **Paid vendor support**: **keep `quiver` available as opt-in** (BYO key). ✅ decided
- **Domain template policy**: N/A for this task (handled in Task 106).

### Implementation steps (ordered)

1. **Make vendor explicit in config**
   - Extend the `congress_trading` connector config to accept:
     - `vendor: "stock_watcher" | "quiver"` (stringly-typed for forwards compatibility is OK)
   - Default `vendor` to `"stock_watcher"` when absent.

2. **Implement Stock Watcher fetch path (free, no auth)**
   - Fetch these public JSON feeds:
     - House: `https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json`
     - Senate: `https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json`
   - Map each record into the connector’s internal trade shape (compatible with existing normalize logic).
   - Apply existing filters (politician/chamber/transaction type/tickers/min amount).
   - Cursoring requirements:
     - Maintain `last_report_date` (YYYY-MM-DD) and `seen_trade_ids` bounded (e.g. last 500).
     - Avoid reprocessing older disclosures when the feed contains all history: if `last_report_date` is set, skip items with `report_date < last_report_date`.
   - Robustness:
     - Handle minor schema variation across feeds (field name differences; missing fields).
     - Parse amount ranges conservatively (disclosures are range-based).

3. **Keep Quiver fetch path (paid, BYO-key)**
   - If `vendor="quiver"`, call Quiver’s endpoint:
     - `https://api.quiverquant.com/beta/live/congresstrading`
     - Header: `Authorization: Bearer ${QUIVER_API_KEY}`
   - If `QUIVER_API_KEY` missing, **skip fetch** with a clear `meta.reason`.
   - Error messaging:
     - treat 403 as “subscription may be required” (avoid claiming a free tier).

4. **Normalize remains vendor-agnostic**
   - Ensure `normalizeCongressTrading()` can handle both vendor payloads (after mapping).
   - `canonicalUrl` should be disclosure link when available; else a vendor landing page.
   - `publishedAt` should be `report_date` (when disclosure became public).

5. **Web UI: vendor selector + key banner only when needed**
   - Add a **Vendor** dropdown to `CongressTradingConfigForm`:
     - `Public disclosures (free)` → `vendor="stock_watcher"`
     - `Quiver Quantitative (paid)` → `vendor="quiver"`
   - Show `ApiKeyBanner`/`ApiKeyGuidance` for Quiver **only** when `vendor="quiver"`.
   - Update `getDefaultConfig("congress_trading")` to include `vendor: "stock_watcher"`.

6. **Docs: fix contract + remove “free Quiver API” claims**
   - Update `docs/connectors.md` `congress_trading` section:
     - document `vendor` and the default free behavior.
     - clearly label Quiver as paid/BYO key.
   - Update `ApiKeyGuidance` text for Quiver to avoid claiming a free API key.

### Acceptance criteria

- [ ] A `congress_trading` source works with **no API key** configured (default `vendor="stock_watcher"`).
- [ ] Selecting `vendor="quiver"` without `QUIVER_API_KEY` causes a **skip** with a clear reason (not a crash).
- [ ] Existing filters still work (politician/chamber/ticker/transaction/min_amount).
- [ ] Docs/UI no longer claim Quiver is a free API tier.
- [ ] `pnpm -r typecheck` passes.

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

Optional smoke test (if you have local services running):

```bash
# Create a congress_trading source (free vendor default)
pnpm dev -- admin:sources-add --type congress_trading --name "congress:all" --config '{"min_amount":15000}'

# Run ingest for that source type
pnpm dev -- admin:run-now --source-type congress_trading --max-items-per-source 20
```

### Commit

- **Message**: `feat(connectors): congress trading free vendor default (stock watcher) + quiver opt-in`
- **Files expected**:
  - `packages/connectors/src/congress_trading/config.ts`
  - `packages/connectors/src/congress_trading/fetch.ts`
  - `packages/connectors/src/congress_trading/normalize.ts`
  - `docs/connectors.md`
  - `packages/web/src/components/SourceConfigForms/CongressTradingConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts`
  - `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx`
  - `packages/web/src/components/ApiKeyGuidance/ApiKeyGuidance.tsx`
