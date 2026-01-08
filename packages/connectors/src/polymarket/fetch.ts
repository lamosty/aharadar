import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parsePolymarketSourceConfig } from "./config";

/**
 * Polymarket Gamma API market response structure
 */
export interface PolymarketRawMarket {
  id: string;
  conditionId: string;
  questionID: string;
  slug: string;
  question: string;
  description: string;
  outcomes: string[]; // ["Yes", "No"]
  outcomePrices: string[]; // ["0.65", "0.35"] - probabilities as strings
  volume: string; // Total volume in cents
  volume24hr: string;
  liquidity: string;
  spread: string;
  bestBid: string;
  bestAsk: string;
  lastTradePrice: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  startDate: string;
  endDate: string;
  endDateIso: string;
  createdAt: string;
  updatedAt: string;
  resolutionSource: string;
  events?: Array<{
    id: string;
    slug: string;
    title: string;
  }>;
}

interface PolymarketCursorJson {
  last_fetch_at?: string;
  seen_condition_ids?: string[];
  last_prices?: Record<string, number>; // condition_id -> probability
}

function parseCursor(cursor: Record<string, unknown>): PolymarketCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const seenConditionIds = Array.isArray(cursor.seen_condition_ids)
    ? cursor.seen_condition_ids.filter((id) => typeof id === "string")
    : undefined;
  const lastPrices =
    cursor.last_prices && typeof cursor.last_prices === "object" && !Array.isArray(cursor.last_prices)
      ? (cursor.last_prices as Record<string, number>)
      : undefined;

  return {
    last_fetch_at: lastFetchAt,
    seen_condition_ids: seenConditionIds,
    last_prices: lastPrices,
  };
}

async function fetchGammaApi(limit: number, includeClosed: boolean): Promise<PolymarketRawMarket[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    active: "true",
  });

  if (!includeClosed) {
    params.set("closed", "false");
  }

  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;

  let retries = 0;
  const maxRetries = 3;
  const baseDelayMs = 1000;

  while (retries <= maxRetries) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data as PolymarketRawMarket[];
      }
      throw new Error(`Polymarket API returned unexpected data format: ${typeof data}`);
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
    throw new Error(`Polymarket API fetch failed (${res.status}): ${body.slice(0, 500)}`);
  }

  throw new Error("Polymarket API fetch failed after max retries");
}

/**
 * Parse volume string to number (API returns volume in cents as string)
 */
export function parseVolume(volumeStr: string): number {
  const parsed = parseFloat(volumeStr);
  return isNaN(parsed) ? 0 : parsed / 100; // Convert cents to dollars
}

/**
 * Parse probability string to decimal
 */
export function parseProbability(priceStr: string): number {
  const parsed = parseFloat(priceStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate probability change from cursor
 */
export function calculateProbabilityChange(
  conditionId: string,
  currentProb: number,
  lastPrices: Record<string, number> | undefined
): number | null {
  if (!lastPrices || !(conditionId in lastPrices)) {
    return null;
  }
  const previousProb = lastPrices[conditionId];
  return (currentProb - previousProb) * 100; // Return as percentage points
}

/**
 * Generate a unique ID for a market
 */
export function generateMarketId(market: PolymarketRawMarket): string {
  return `pm_${market.conditionId}`;
}

/**
 * Fetch prediction markets from Polymarket Gamma API
 */
export async function fetchPolymarket(params: FetchParams): Promise<FetchResult> {
  const config = parsePolymarketSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const maxItems = config.max_markets_per_fetch ?? 50;
  const seenIds = new Set(cursorIn.seen_condition_ids ?? []);
  const lastPrices = cursorIn.last_prices ?? {};
  const rawItems: PolymarketRawMarket[] = [];
  const newSeenIds: string[] = [...seenIds];
  const newPrices: Record<string, number> = { ...lastPrices };

  try {
    // Fetch more than we need to allow for filtering
    const markets = await fetchGammaApi(Math.min(maxItems * 3, 200), config.include_resolved ?? false);

    for (const market of markets) {
      if (rawItems.length >= maxItems) break;

      // Skip archived markets
      if (market.archived) continue;

      // Parse key metrics
      const volume = parseVolume(market.volume);
      const liquidity = parseVolume(market.liquidity);
      const probability = market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) : 0;

      // Apply filters
      // Volume filter
      if (config.min_volume && config.min_volume > 0) {
        if (volume < config.min_volume) continue;
      }

      // Liquidity filter
      if (config.min_liquidity && config.min_liquidity > 0) {
        if (liquidity < config.min_liquidity) continue;
      }

      // Calculate and check probability change
      const probChange = calculateProbabilityChange(market.conditionId, probability, cursorIn.last_prices);

      // Probability change threshold filter
      if (config.probability_change_threshold && config.probability_change_threshold > 0) {
        // For existing markets, check if change meets threshold
        // For new markets (no previous price), always include
        if (probChange !== null && Math.abs(probChange) < config.probability_change_threshold) {
          // Still track price even if we don't emit the item
          newPrices[market.conditionId] = probability;
          continue;
        }
      }

      // Track price for future change calculation
      newPrices[market.conditionId] = probability;

      // Mark as seen and add to results
      if (!seenIds.has(market.conditionId)) {
        newSeenIds.push(market.conditionId);
      }
      rawItems.push(market);
    }
  } catch (error) {
    console.error(`polymarket: Error fetching from Gamma API: ${error}`);
    // Return empty results but preserve cursor
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  // Build next cursor - keep only recent data to prevent unbounded growth
  // Keep last 500 IDs and prices
  const recentSeenIds = newSeenIds.slice(-500);
  const recentPrices: Record<string, number> = {};
  const priceKeys = Object.keys(newPrices).slice(-500);
  for (const key of priceKeys) {
    recentPrices[key] = newPrices[key];
  }

  const nextCursor: PolymarketCursorJson = {
    last_fetch_at: new Date().toISOString(),
    seen_condition_ids: recentSeenIds.length > 0 ? recentSeenIds : undefined,
    last_prices: Object.keys(recentPrices).length > 0 ? recentPrices : undefined,
  };

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      markets_fetched: rawItems.length,
      filters_applied: {
        min_volume: config.min_volume,
        min_liquidity: config.min_liquidity,
        probability_change_threshold: config.probability_change_threshold,
        include_resolved: config.include_resolved,
      },
    },
  };
}
