import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parseOptionsFlowSourceConfig } from "./config";

/**
 * Options flow data structure
 */
export interface OptionsFlowRaw {
  id: string;
  symbol: string;
  strike: number;
  expiry: string; // YYYY-MM-DD
  contract_type: "call" | "put";
  flow_type: "sweep" | "block" | "unusual";
  sentiment: "bullish" | "bearish" | "neutral";
  premium: number; // Total premium in USD
  volume: number; // Number of contracts
  open_interest: number; // Prior open interest
  spot_price: number; // Underlying price at time of order
  timestamp: string; // ISO timestamp
  exchange?: string; // Exchange(s) where executed
}

interface OptionsFlowCursorJson {
  last_fetch_at?: string;
  last_seen_id?: string;
  seen_ids?: string[];
}

// Common ETF symbols for filtering
const ETF_SYMBOLS = new Set([
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "XLF",
  "XLE",
  "XLK",
  "XLV",
  "XLI",
  "XLP",
  "XLU",
  "XLB",
  "XLY",
  "XLRE",
  "GLD",
  "SLV",
  "TLT",
  "HYG",
  "EEM",
  "EFA",
  "VXX",
  "UVXY",
  "SQQQ",
  "TQQQ",
  "ARKK",
]);

function parseCursor(cursor: Record<string, unknown>): OptionsFlowCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const lastSeenId = typeof cursor.last_seen_id === "string" ? cursor.last_seen_id : undefined;
  const seenIds = Array.isArray(cursor.seen_ids)
    ? cursor.seen_ids.filter((id) => typeof id === "string")
    : undefined;

  return {
    last_fetch_at: lastFetchAt,
    last_seen_id: lastSeenId,
    seen_ids: seenIds,
  };
}

async function fetchUnusualWhalesApi(apiKey: string): Promise<OptionsFlowRaw[]> {
  // Unusual Whales public API endpoint
  const url = "https://api.unusualwhales.com/api/flow";

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

      // The API response structure may vary - handle both array and object with data field
      let flows: unknown[];
      if (Array.isArray(data)) {
        flows = data;
      } else if (data && typeof data === "object" && Array.isArray(data.data)) {
        flows = data.data;
      } else {
        throw new Error(`Unusual Whales API returned unexpected data format: ${typeof data}`);
      }

      // Normalize the response to our internal format
      return flows.map((flow: unknown) => normalizeApiResponse(flow));
    }

    // Handle specific error codes
    if (res.status === 401) {
      throw new Error("Unusual Whales API: Invalid or expired API key (401)");
    }

    if (res.status === 403) {
      throw new Error("Unusual Whales API: Access denied - free tier limit may be exceeded (403)");
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
    throw new Error(`Unusual Whales API fetch failed (${res.status}): ${body.slice(0, 500)}`);
  }

  throw new Error("Unusual Whales API fetch failed after max retries");
}

/**
 * Normalize Unusual Whales API response to our internal format
 * API field names may vary - this handles common variations
 */
function normalizeApiResponse(raw: unknown): OptionsFlowRaw {
  const r = raw as Record<string, unknown>;

  // Generate ID if not present
  const id =
    (r.id as string) ||
    (r.alert_id as string) ||
    `${r.symbol}_${r.strike}_${r.expiration || r.expiry}_${r.timestamp || Date.now()}`;

  // Normalize contract type
  let contractType: "call" | "put" = "call";
  const type = ((r.contract_type || r.type || r.put_call || r.option_type) as string)?.toLowerCase();
  if (type === "put" || type === "p") {
    contractType = "put";
  }

  // Normalize flow type
  let flowType: "sweep" | "block" | "unusual" = "unusual";
  const flowTypeRaw = ((r.flow_type || r.order_type || r.type) as string)?.toLowerCase();
  if (flowTypeRaw?.includes("sweep")) {
    flowType = "sweep";
  } else if (flowTypeRaw?.includes("block")) {
    flowType = "block";
  }

  // Normalize sentiment
  let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
  const sentimentRaw = ((r.sentiment || r.direction) as string)?.toLowerCase();
  if (sentimentRaw?.includes("bull") || sentimentRaw === "buy") {
    sentiment = "bullish";
  } else if (sentimentRaw?.includes("bear") || sentimentRaw === "sell") {
    sentiment = "bearish";
  }

  return {
    id: String(id),
    symbol: String(r.symbol || r.ticker || "").toUpperCase(),
    strike: Number(r.strike || r.strike_price || 0),
    expiry: String(r.expiry || r.expiration || r.expires || ""),
    contract_type: contractType,
    flow_type: flowType,
    sentiment,
    premium: Number(r.premium || r.total_premium || r.value || 0),
    volume: Number(r.volume || r.contracts || r.size || 0),
    open_interest: Number(r.open_interest || r.oi || 0),
    spot_price: Number(r.spot_price || r.underlying_price || r.stock_price || 0),
    timestamp: String(r.timestamp || r.created_at || r.time || new Date().toISOString()),
    exchange: r.exchange ? String(r.exchange) : undefined,
  };
}

/**
 * Classify sentiment based on contract characteristics
 */
export function classifySentiment(flow: OptionsFlowRaw): "bullish" | "bearish" | "neutral" {
  if (flow.sentiment !== "neutral") {
    return flow.sentiment;
  }

  const isCall = flow.contract_type === "call";
  const isOTM = isCall ? flow.strike > flow.spot_price : flow.strike < flow.spot_price;

  // Sweeps on OTM calls = bullish, OTM puts = bearish
  if (flow.flow_type === "sweep") {
    if (isCall && isOTM) return "bullish";
    if (!isCall && isOTM) return "bearish";
  }

  return "neutral";
}

/**
 * Calculate days to expiration
 */
export function calculateDaysToExpiry(expiryDate: string): number {
  try {
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) return 0;
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

/**
 * Generate a unique ID for an options flow alert
 */
export function generateFlowId(flow: OptionsFlowRaw): string {
  return `of_${flow.id}`;
}

/**
 * Fetch options flow from Unusual Whales API
 */
export async function fetchOptionsFlow(params: FetchParams): Promise<FetchResult> {
  const config = parseOptionsFlowSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey) {
    console.warn("options_flow: UNUSUAL_WHALES_API_KEY not configured, skipping fetch");
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        skipped: true,
        reason: "UNUSUAL_WHALES_API_KEY not configured",
      },
    };
  }

  const maxItems = config.max_alerts_per_fetch ?? 50;
  const seenIds = new Set(cursorIn.seen_ids ?? []);
  const rawItems: OptionsFlowRaw[] = [];
  const newSeenIds: string[] = [...seenIds];

  try {
    const flows = await fetchUnusualWhalesApi(apiKey);

    for (const flow of flows) {
      if (rawItems.length >= maxItems) break;

      // Skip if we've already seen this flow
      if (seenIds.has(flow.id)) {
        continue;
      }

      // Apply filters

      // Symbol filter
      if (config.symbols && config.symbols.length > 0) {
        if (!config.symbols.includes(flow.symbol)) continue;
      }

      // ETF filter
      if (!config.include_etfs && ETF_SYMBOLS.has(flow.symbol)) {
        continue;
      }

      // Premium filter
      if (config.min_premium && config.min_premium > 0) {
        if (flow.premium < config.min_premium) continue;
      }

      // Flow type filter
      if (config.flow_types && config.flow_types.length > 0) {
        if (!config.flow_types.includes(flow.flow_type)) continue;
      }

      // Sentiment filter (classify if needed)
      const sentiment = classifySentiment(flow);
      if (config.sentiment_filter) {
        if (sentiment !== config.sentiment_filter) continue;
      }
      // Update flow with classified sentiment
      flow.sentiment = sentiment;

      // Expiry filter
      const daysToExpiry = calculateDaysToExpiry(flow.expiry);
      if (config.expiry_max_days && daysToExpiry > config.expiry_max_days) {
        continue;
      }

      // Mark as seen and add to results
      newSeenIds.push(flow.id);
      rawItems.push(flow);
    }
  } catch (error) {
    console.error(`options_flow: Error fetching from Unusual Whales API: ${error}`);
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
  const recentSeenIds = newSeenIds.slice(-500);

  const nextCursor: OptionsFlowCursorJson = {
    last_fetch_at: new Date().toISOString(),
    last_seen_id: rawItems.length > 0 ? rawItems[rawItems.length - 1].id : cursorIn.last_seen_id,
    seen_ids: recentSeenIds.length > 0 ? recentSeenIds : undefined,
  };

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      alerts_fetched: rawItems.length,
      filters_applied: {
        symbols: config.symbols,
        min_premium: config.min_premium,
        flow_types: config.flow_types,
        sentiment_filter: config.sentiment_filter,
        include_etfs: config.include_etfs,
        expiry_max_days: config.expiry_max_days,
      },
    },
  };
}
