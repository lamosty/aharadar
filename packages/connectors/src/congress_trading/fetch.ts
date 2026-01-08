import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parseCongressTradingSourceConfig } from "./config";

/**
 * Quiver Quantitative Congress Trade response structure
 */
export interface QuiverCongressTrade {
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
  return AMOUNT_RANGES[range] ?? { min: 0, max: 0 };
}

/**
 * Determine chamber from District field
 * Senate: contains "-Sen" (e.g., "TX-Sen")
 * House: district number (e.g., "CA-12")
 */
export function getChamber(district: string): "senate" | "house" {
  return district.includes("-Sen") ? "senate" : "house";
}

/**
 * Generate a unique composite ID for a trade to avoid duplicates
 */
export function generateTradeId(trade: QuiverCongressTrade): string {
  const txnType = trade.Transaction.toLowerCase().replace(/\s+/g, "_");
  // Use bioguide_id + ticker + date + transaction type as composite key
  return `ct_${trade.BioGuideId}_${trade.Ticker}_${trade.Date}_${txnType}`;
}

function parseCursor(cursor: Record<string, unknown>): CongressTradingCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const lastReportDate = typeof cursor.last_report_date === "string" ? cursor.last_report_date : undefined;
  const seenTradeIds = Array.isArray(cursor.seen_trade_ids)
    ? cursor.seen_trade_ids.filter((id) => typeof id === "string")
    : undefined;

  return {
    last_fetch_at: lastFetchAt,
    last_report_date: lastReportDate,
    seen_trade_ids: seenTradeIds,
  };
}

async function fetchQuiverApi(apiKey: string): Promise<QuiverCongressTrade[]> {
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
        return data as QuiverCongressTrade[];
      }
      throw new Error(`Quiver API returned unexpected data format: ${typeof data}`);
    }

    // Handle specific error codes
    if (res.status === 401) {
      throw new Error("Quiver API: Invalid or expired API key (401)");
    }

    if (res.status === 403) {
      throw new Error("Quiver API: Access denied - free tier limit may be exceeded (403)");
    }

    // Retry on rate limit or server errors
    if (res.status === 429 || res.status >= 500) {
      if (retries < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, retries);
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

/**
 * Fetch Congress trades from Quiver Quantitative API
 */
export async function fetchCongressTrading(params: FetchParams): Promise<FetchResult> {
  const config = parseCongressTradingSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const apiKey = process.env.QUIVER_API_KEY;
  if (!apiKey) {
    console.warn("congress_trading: QUIVER_API_KEY not configured, skipping fetch");
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        skipped: true,
        reason: "QUIVER_API_KEY not configured",
      },
    };
  }

  const maxItems = config.max_trades_per_fetch ?? 50;
  const seenIds = new Set(cursorIn.seen_trade_ids ?? []);
  const rawItems: QuiverCongressTrade[] = [];
  const newSeenIds: string[] = [...seenIds];
  let newestReportDate = cursorIn.last_report_date ?? "";

  try {
    const trades = await fetchQuiverApi(apiKey);

    for (const trade of trades) {
      if (rawItems.length >= maxItems) break;

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
      if (trade.ReportDate > newestReportDate) {
        newestReportDate = trade.ReportDate;
      }

      // Mark as seen and add to results
      newSeenIds.push(tradeId);
      rawItems.push(trade);
    }
  } catch (error) {
    console.error(`congress_trading: Error fetching from Quiver API: ${error}`);
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
