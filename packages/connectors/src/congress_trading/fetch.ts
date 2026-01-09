import type { FetchParams, FetchResult } from "@aharadar/shared";
import { sha256Hex } from "@aharadar/shared";
import { parseCongressTradingSourceConfig } from "./config";

/**
 * Normalized congress trade shape used by the connector.
 *
 * - Quiver vendor returns this shape directly.
 * - Stock Watcher vendor is mapped into this shape.
 */
export interface CongressTrade {
  Representative: string;
  BioGuideId: string;
  District: string; // e.g., "CA-12" or "TX-Sen"
  Party: string; // "D" | "R" | "I"
  Ticker: string;
  Asset: string; // Full asset description
  Transaction: string; // "Purchase" | "Sale" | "Exchange"
  Range: string; // "$1,001 - $15,000" etc.
  Date: string; // Transaction date (YYYY-MM-DD)
  ReportDate: string; // Filing date (YYYY-MM-DD)
  Link: string; // Link to disclosure
}

interface CongressTradingCursorJson {
  last_fetch_at?: string;
  last_report_date?: string;
  seen_trade_ids?: string[];
}

/**
 * Amount range parsing - Congress disclosures use ranges, not exact amounts
 */
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

export function parseAmountRange(range: string): { min: number; max: number } {
  const direct = AMOUNT_RANGES[range];
  if (direct) return direct;

  // Fallback: parse numeric amounts from the string.
  // Handles variants like "$15,001-$50,000", "15,001 - 50,000", "Over $50,000,000", etc.
  const normalized = String(range ?? "").trim();
  if (normalized.length === 0) return { min: 0, max: 0 };

  const nums = [...normalized.matchAll(/[\d,]+/g)]
    .map((m) => Number(m[0].replaceAll(",", "")))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0) return { min: 0, max: 0 };

  const lower = normalized.toLowerCase();
  if (lower.includes("over") || lower.includes("above") || lower.includes("+")) {
    return { min: nums[0] ?? 0, max: Infinity };
  }

  if (nums.length >= 2) {
    return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
  }

  return { min: nums[0], max: nums[0] };
}

/**
 * Determine chamber from District field
 * Senate: contains "-Sen" (e.g., "TX-Sen")
 * House: district number (e.g., "CA-12")
 */
export function getChamber(district: string): "senate" | "house" {
  return district.includes("-Sen") ? "senate" : "house";
}

function normalizeDateYmd(input: string): string {
  const s = String(input ?? "").trim();
  if (s.length === 0) return "";

  // Already canonical
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replaceAll("/", "-");

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Best-effort parse
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0] ?? "";
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getStringField(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return "";
}

function getNumberField(r: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replaceAll(",", ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function normalizeTicker(raw: string): string {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "N/A" || t === "NA") return "";
  return t;
}

function normalizeTransaction(raw: string): string {
  const s = String(raw ?? "").trim();
  if (s.length === 0) return "";
  // Preserve original-ish casing for readability but normalize common variants.
  const lower = s.toLowerCase();
  if (lower.includes("purchase")) return "Purchase";
  if (lower.includes("sale")) return "Sale";
  if (lower.includes("exchange")) return "Exchange";
  return s;
}

function normalizeAmountRange(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return `$${raw.toLocaleString()}`;
  return "";
}

/**
 * Generate a unique composite ID for a trade to avoid duplicates
 */
export function generateTradeId(trade: CongressTrade): string {
  const txnType = trade.Transaction.toLowerCase().replace(/\s+/g, "_");
  const personId =
    trade.BioGuideId?.trim().length > 0
      ? trade.BioGuideId.trim()
      : sha256Hex(`person|${trade.Representative}|${trade.District}|${trade.Party}`).slice(0, 12);
  const ticker = trade.Ticker.toUpperCase();
  const date = normalizeDateYmd(trade.Date);
  return `ct_${personId}_${ticker}_${date}_${txnType}`;
}

function parseCursor(cursor: Record<string, unknown>): CongressTradingCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const lastReportDate =
    typeof cursor.last_report_date === "string"
      ? normalizeDateYmd(cursor.last_report_date)
      : undefined;
  const seenTradeIds = Array.isArray(cursor.seen_trade_ids)
    ? cursor.seen_trade_ids.filter((id) => typeof id === "string")
    : undefined;

  return {
    last_fetch_at: lastFetchAt,
    last_report_date: lastReportDate,
    seen_trade_ids: seenTradeIds,
  };
}

async function fetchQuiverApi(apiKey: string): Promise<CongressTrade[]> {
  const url = "https://api.quiverquant.com/beta/live/congresstrading";

  let retries = 0;
  const maxRetries = 3;
  const baseDelayMs = 1000;

  while (retries <= maxRetries) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data as CongressTrade[];
      }
      throw new Error(`Quiver API returned unexpected data format: ${typeof data}`);
    }

    // Handle specific error codes
    if (res.status === 401) {
      throw new Error("Quiver API: Invalid or expired API key (401)");
    }

    if (res.status === 403) {
      throw new Error("Quiver API: Access denied - subscription may be required (403)");
    }

    // Retry on rate limit or server errors
    if (res.status === 429 || res.status >= 500) {
      if (retries < maxRetries) {
        const delayMs = baseDelayMs * 2 ** retries;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        retries++;
        continue;
      }
    }

    const body = await res.text().catch(() => "");
    throw new Error(`Quiver API fetch failed (${res.status}): ${body.slice(0, 500)}`);
  }

  throw new Error("Quiver API fetch failed after max retries");
}

async function fetchJsonArrayWithRetries(
  url: string,
  headers?: Record<string, string>,
): Promise<unknown[]> {
  let retries = 0;
  const maxRetries = 3;
  const baseDelayMs = 1000;

  while (retries <= maxRetries) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
        return (data as { data: unknown[] }).data;
      }
      throw new Error(`Stock Watcher feed returned unexpected data format: ${typeof data}`);
    }

    if (res.status === 429 || res.status >= 500) {
      if (retries < maxRetries) {
        const delayMs = baseDelayMs * 2 ** retries;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        retries++;
        continue;
      }
    }

    const body = await res.text().catch(() => "");
    throw new Error(`Stock Watcher feed fetch failed (${res.status}): ${body.slice(0, 500)}`);
  }

  throw new Error("Stock Watcher feed fetch failed after max retries");
}

function normalizeStockWatcherRecord(
  raw: unknown,
  chamber: "house" | "senate",
): CongressTrade | null {
  const r = asRecord(raw);

  const representative = getStringField(r, [
    "representative",
    "Representative",
    "member",
    "Member",
    "senator",
    "Senator",
    "politician",
    "Politician",
    "name",
    "Name",
  ]);

  const party = getStringField(r, ["party", "Party"]);
  const ticker = normalizeTicker(getStringField(r, ["ticker", "Ticker", "symbol", "Symbol"]));
  const asset = getStringField(r, [
    "asset_description",
    "assetDescription",
    "Asset",
    "asset",
    "description",
    "Description",
  ]);

  const transaction = normalizeTransaction(
    getStringField(r, ["transaction", "Transaction", "transaction_type", "type", "Type"]),
  );

  const amountRange = normalizeAmountRange(
    getStringField(r, ["amount", "Amount", "range", "Range", "amount_range", "amountRange"]) ||
      getNumberField(r, ["amount_min", "amountMin", "amount"]) ||
      "",
  );

  const transactionDateRaw = getStringField(r, [
    "transaction_date",
    "transactionDate",
    "date",
    "Date",
  ]);
  const reportDateRaw = getStringField(r, [
    "report_date",
    "reportDate",
    "disclosure_date",
    "ReportDate",
  ]);

  const transactionDate = normalizeDateYmd(transactionDateRaw);
  const reportDate = normalizeDateYmd(reportDateRaw);

  const bioGuideId = getStringField(r, ["bioguide_id", "bioguideId", "BioGuideId", "bioguideID"]);

  const link = getStringField(r, ["link", "Link", "disclosure_url", "disclosureUrl", "url", "URL"]);

  // District/state handling
  let district = getStringField(r, ["district", "District"]);
  const state = getStringField(r, ["state", "State"]).toUpperCase();
  const districtNum =
    getStringField(r, ["district_number", "districtNumber"]).trim() ||
    (getNumberField(r, ["district_number", "districtNumber"]) ?? "").toString();

  if (!district) {
    if (chamber === "house") {
      if (state && districtNum) district = `${state}-${districtNum}`;
    } else {
      if (state) district = `${state}-Sen`;
    }
  } else if (chamber === "senate" && !district.includes("-Sen")) {
    // Normalize senate district into the same pattern used by Quiver
    district = `${district}-Sen`;
  }

  // Ensure district is non-empty and chamber-identifiable (used downstream for labeling).
  if (!district) {
    district = chamber === "senate" ? "US-Sen" : "US-00";
  }

  // Required fields for our downstream logic
  if (!representative || !ticker || !transaction) return null;

  return {
    Representative: representative,
    BioGuideId: bioGuideId,
    District: district,
    Party: party,
    Ticker: ticker,
    Asset: asset,
    Transaction: transaction,
    Range: amountRange,
    Date: transactionDate,
    ReportDate: reportDate,
    Link: link,
  };
}

async function fetchStockWatcherTrades(
  chambers?: ("senate" | "house")[],
): Promise<CongressTrade[]> {
  const shouldFetchHouse = !chambers || chambers.length === 0 || chambers.includes("house");
  const shouldFetchSenate = !chambers || chambers.length === 0 || chambers.includes("senate");

  const trades: CongressTrade[] = [];

  if (shouldFetchHouse) {
    const houseUrl =
      "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";
    const raw = await fetchJsonArrayWithRetries(houseUrl);
    for (const item of raw) {
      const normalized = normalizeStockWatcherRecord(item, "house");
      if (normalized) trades.push(normalized);
    }
  }

  if (shouldFetchSenate) {
    const senateUrl =
      "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json";
    const raw = await fetchJsonArrayWithRetries(senateUrl);
    for (const item of raw) {
      const normalized = normalizeStockWatcherRecord(item, "senate");
      if (normalized) trades.push(normalized);
    }
  }

  return trades;
}

/**
 * Fetch Congress trades from the configured vendor.
 */
export async function fetchCongressTrading(params: FetchParams): Promise<FetchResult> {
  const config = parseCongressTradingSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const vendor = config.vendor ?? "stock_watcher";

  const maxItems = config.max_trades_per_fetch ?? 50;
  const seenIds = new Set(cursorIn.seen_trade_ids ?? []);
  const rawItems: CongressTrade[] = [];
  const newSeenIds: string[] = [...seenIds];
  const lastReportDate = cursorIn.last_report_date ?? "";
  let newestReportDate = lastReportDate;

  let trades: CongressTrade[] = [];

  try {
    if (vendor === "quiver") {
      const apiKey = process.env.QUIVER_API_KEY;
      if (!apiKey) {
        console.warn(
          "congress_trading: vendor=quiver but QUIVER_API_KEY not configured, skipping fetch",
        );
        return {
          rawItems: [],
          nextCursor: cursorIn as Record<string, unknown>,
          meta: {
            skipped: true,
            vendor,
            reason: "QUIVER_API_KEY not configured (Quiver vendor selected)",
          },
        };
      }
      trades = await fetchQuiverApi(apiKey);
    } else {
      trades = await fetchStockWatcherTrades(config.chambers);
    }

    // Ensure we process newest disclosures first (important for all-history feeds).
    trades.sort((a, b) => {
      const ar = normalizeDateYmd(a.ReportDate);
      const br = normalizeDateYmd(b.ReportDate);
      if (ar !== br) return br.localeCompare(ar);
      const ad = normalizeDateYmd(a.Date);
      const bd = normalizeDateYmd(b.Date);
      if (ad !== bd) return bd.localeCompare(ad);
      return String(b.Ticker).localeCompare(String(a.Ticker));
    });

    for (const trade of trades) {
      if (rawItems.length >= maxItems) break;

      // Cursor filter: avoid reprocessing very old disclosures for all-history feeds.
      const reportDate = normalizeDateYmd(trade.ReportDate);
      if (lastReportDate && reportDate && reportDate < lastReportDate) {
        continue;
      }

      // Generate composite ID
      const tradeId = generateTradeId(trade);

      // Skip if we've already seen this trade
      if (seenIds.has(tradeId)) {
        continue;
      }

      // Apply filters
      const chamber = getChamber(trade.District);

      // Chamber filter
      if (config.chambers && config.chambers.length > 0) {
        if (!config.chambers.includes(chamber)) continue;
      }

      // Politician filter (case-insensitive partial match)
      if (config.politicians && config.politicians.length > 0) {
        const repLower = trade.Representative.toLowerCase();
        const matches = config.politicians.some((p) => repLower.includes(p.toLowerCase()));
        if (!matches) continue;
      }

      // Transaction type filter
      if (config.transaction_types && config.transaction_types.length > 0) {
        const txnLower = trade.Transaction.toLowerCase();
        if (!config.transaction_types.includes(txnLower as "purchase" | "sale")) continue;
      }

      // Ticker filter
      if (config.tickers && config.tickers.length > 0) {
        if (!config.tickers.includes(trade.Ticker.toUpperCase())) continue;
      }

      // Amount filter
      if (config.min_amount && config.min_amount > 0) {
        const { min: rangeMin } = parseAmountRange(trade.Range);
        if (rangeMin < config.min_amount) continue;
      }

      // Track newest report date for cursor
      if (reportDate && reportDate > newestReportDate) {
        newestReportDate = reportDate;
      }

      // Mark as seen and add to results
      newSeenIds.push(tradeId);
      rawItems.push(trade);
    }
  } catch (error) {
    console.error(`congress_trading: Error fetching trades (vendor=${vendor}): ${error}`);
    // Return empty results but preserve cursor
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  // Build next cursor - keep only recent seen IDs to prevent unbounded growth
  // Keep last 500 IDs (enough for several days of trades)
  const recentSeenIds = newSeenIds.slice(-500);

  const nextCursor: CongressTradingCursorJson = {
    last_fetch_at: new Date().toISOString(),
    last_report_date: newestReportDate || undefined,
    seen_trade_ids: recentSeenIds.length > 0 ? recentSeenIds : undefined,
  };

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      vendor,
      trades_fetched: rawItems.length,
      filters_applied: {
        politicians: config.politicians,
        chambers: config.chambers,
        transaction_types: config.transaction_types,
        tickers: config.tickers,
        min_amount: config.min_amount,
      },
    },
  };
}
