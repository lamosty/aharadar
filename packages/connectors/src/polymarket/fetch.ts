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
  restricted?: boolean; // true if market is restricted (requires UI badge)
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

/**
 * Candidate market with computed spike/new detection fields
 * Passed to normalize for richer metadata
 */
export interface PolymarketCandidate {
  market: PolymarketRawMarket;
  isNew: boolean;
  isSpike: boolean;
  spikeReason: "probability" | "volume" | "both" | null;
  probabilityChangePP: number | null; // percentage points
  volume24hChangePct: number | null; // percentage change
  volume24hChangeAbs: number | null; // absolute USD change
  observedAt: string; // ISO timestamp for spike observation time
}

interface PolymarketCursorJson {
  last_fetch_at?: string;
  seen_condition_ids?: string[];
  last_prices?: Record<string, number>; // condition_id -> probability (decimal 0-1)
  last_volume_24h?: Record<string, number>; // condition_id -> 24h volume USD
}

function parseCursor(cursor: Record<string, unknown>): PolymarketCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const seenConditionIds = Array.isArray(cursor.seen_condition_ids)
    ? cursor.seen_condition_ids.filter((id) => typeof id === "string")
    : undefined;
  const lastPrices =
    cursor.last_prices &&
    typeof cursor.last_prices === "object" &&
    !Array.isArray(cursor.last_prices)
      ? (cursor.last_prices as Record<string, number>)
      : undefined;
  const lastVolume24h =
    cursor.last_volume_24h &&
    typeof cursor.last_volume_24h === "object" &&
    !Array.isArray(cursor.last_volume_24h)
      ? (cursor.last_volume_24h as Record<string, number>)
      : undefined;

  return {
    last_fetch_at: lastFetchAt,
    seen_condition_ids: seenConditionIds,
    last_prices: lastPrices,
    last_volume_24h: lastVolume24h,
  };
}

async function fetchGammaApi(
  limit: number,
  includeClosed: boolean,
): Promise<PolymarketRawMarket[]> {
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
        const delayMs = baseDelayMs * 2 ** retries;
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
  return Number.isNaN(parsed) ? 0 : parsed / 100; // Convert cents to dollars
}

/**
 * Parse probability string to decimal
 */
export function parseProbability(priceStr: string): number {
  const parsed = parseFloat(priceStr);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate probability change from cursor
 */
export function calculateProbabilityChange(
  conditionId: string,
  currentProb: number,
  lastPrices: Record<string, number> | undefined,
): number | null {
  if (!lastPrices || !(conditionId in lastPrices)) {
    return null;
  }
  const previousProb = lastPrices[conditionId];
  return (currentProb - previousProb) * 100; // Return as percentage points
}

/**
 * Calculate volume change (percentage and absolute) from cursor
 */
export function calculateVolumeChange(
  conditionId: string,
  currentVolume24h: number,
  lastVolume24h: Record<string, number> | undefined,
): { pct: number | null; abs: number | null } {
  if (!lastVolume24h || !(conditionId in lastVolume24h)) {
    return { pct: null, abs: null };
  }
  const previousVolume = lastVolume24h[conditionId];
  const absChange = currentVolume24h - previousVolume;
  // Avoid division by zero - if previous was 0, we can't calculate % change
  const pctChange = previousVolume > 0 ? (absChange / previousVolume) * 100 : null;
  return { pct: pctChange, abs: absChange };
}

/**
 * Generate a unique ID for a market
 */
export function generateMarketId(market: PolymarketRawMarket): string {
  return `pm_${market.conditionId}`;
}

/**
 * Fetch prediction markets from Polymarket Gamma API
 * Supports daily digest mode with new markets and spike detection
 */
export async function fetchPolymarket(params: FetchParams): Promise<FetchResult> {
  const config = parsePolymarketSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const maxItems = config.max_markets_per_fetch ?? 50;
  const seenIds = new Set(cursorIn.seen_condition_ids ?? []);
  const lastPrices = cursorIn.last_prices ?? {};
  const lastVolume24h = cursorIn.last_volume_24h ?? {};

  // Track for cursor update
  const newSeenIds: string[] = [...seenIds];
  const newPrices: Record<string, number> = { ...lastPrices };
  const newVolume24h: Record<string, number> = { ...lastVolume24h };

  // Parse window for "new market" detection
  const windowStart = new Date(params.windowStart);
  const windowEnd = new Date(params.windowEnd);
  const observedAt = windowEnd.toISOString();

  // Candidates for emission
  const spikeMarkets: PolymarketCandidate[] = [];
  const newMarkets: PolymarketCandidate[] = [];

  try {
    // Fetch more than we need to allow for filtering
    const markets = await fetchGammaApi(
      Math.min(maxItems * 3, 200),
      config.include_resolved ?? false,
    );

    for (const market of markets) {
      // Skip archived markets
      if (market.archived) continue;

      // Parse key metrics
      const volume = parseVolume(market.volume);
      const liquidity = parseVolume(market.liquidity);
      const volume24h = parseVolume(market.volume24hr);
      const probability =
        market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) : 0;

      // Always track prices/volumes for cursor regardless of emission
      newPrices[market.conditionId] = probability;
      newVolume24h[market.conditionId] = volume24h;
      if (!seenIds.has(market.conditionId)) {
        newSeenIds.push(market.conditionId);
      }

      // ----- Baseline filters (apply to all) -----

      // Volume filter
      if (config.min_volume && config.min_volume > 0) {
        if (volume < config.min_volume) continue;
      }

      // Liquidity filter
      if (config.min_liquidity && config.min_liquidity > 0) {
        if (liquidity < config.min_liquidity) continue;
      }

      // Min 24h volume filter
      if (config.min_volume_24h && config.min_volume_24h > 0) {
        if (volume24h < config.min_volume_24h) continue;
      }

      // Restricted filter
      if (config.include_restricted === false && market.restricted === true) {
        continue;
      }

      // ----- Determine if new -----
      let isNew = false;
      if (config.include_new_markets) {
        // New = not seen before AND createdAt within window
        const createdAt = new Date(market.createdAt);
        const notSeen = !seenIds.has(market.conditionId);
        const withinWindow = createdAt >= windowStart;
        isNew = notSeen && withinWindow;
      }

      // ----- Determine if spike -----
      let isSpike = false;
      let spikeReason: "probability" | "volume" | "both" | null = null;

      if (config.include_spike_markets) {
        // Spike baseline filters
        const spikeMinVol24h = config.spike_min_volume_24h ?? 0;
        const spikeMinLiq = config.spike_min_liquidity ?? 0;

        if (volume24h >= spikeMinVol24h && liquidity >= spikeMinLiq) {
          // Calculate changes
          const probChange = calculateProbabilityChange(
            market.conditionId,
            probability,
            cursorIn.last_prices,
          );
          const volChange = calculateVolumeChange(
            market.conditionId,
            volume24h,
            cursorIn.last_volume_24h,
          );

          const probThreshold = config.spike_probability_change_threshold ?? 10;
          const volThreshold = config.spike_volume_change_threshold ?? 100;

          const isProbSpike = probChange !== null && Math.abs(probChange) >= probThreshold;
          const isVolSpike = volChange.pct !== null && Math.abs(volChange.pct) >= volThreshold;

          if (isProbSpike && isVolSpike) {
            isSpike = true;
            spikeReason = "both";
          } else if (isProbSpike) {
            isSpike = true;
            spikeReason = "probability";
          } else if (isVolSpike) {
            isSpike = true;
            spikeReason = "volume";
          }
        }
      }

      // ----- Emit if new OR spike -----
      if (!isNew && !isSpike) continue;

      // Calculate fields for candidate
      const probChange = calculateProbabilityChange(
        market.conditionId,
        probability,
        cursorIn.last_prices,
      );
      const volChange = calculateVolumeChange(
        market.conditionId,
        volume24h,
        cursorIn.last_volume_24h,
      );

      const candidate: PolymarketCandidate = {
        market,
        isNew,
        isSpike,
        spikeReason,
        probabilityChangePP: probChange,
        volume24hChangePct: volChange.pct,
        volume24hChangeAbs: volChange.abs,
        observedAt,
      };

      if (isSpike) {
        spikeMarkets.push(candidate);
      } else if (isNew) {
        newMarkets.push(candidate);
      }
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

  // ----- Prioritize and cap -----
  // Sort spikes by max change magnitude (probability change pp or volume change pct)
  spikeMarkets.sort((a, b) => {
    const aMag = Math.max(
      Math.abs(a.probabilityChangePP ?? 0),
      Math.abs(a.volume24hChangePct ?? 0) / 10, // Normalize vol% to be comparable to prob pp
    );
    const bMag = Math.max(
      Math.abs(b.probabilityChangePP ?? 0),
      Math.abs(b.volume24hChangePct ?? 0) / 10,
    );
    return bMag - aMag;
  });

  // Sort new markets by createdAt desc
  newMarkets.sort((a, b) => {
    const aTime = new Date(a.market.createdAt).getTime();
    const bTime = new Date(b.market.createdAt).getTime();
    return bTime - aTime;
  });

  // Combine: spikes first, then new, cap at maxItems
  const combined = [...spikeMarkets, ...newMarkets].slice(0, maxItems);

  // ----- Build next cursor -----
  // Keep last 500 entries to bound cursor size
  const recentSeenIds = newSeenIds.slice(-500);

  const recentPrices: Record<string, number> = {};
  const priceKeys = Object.keys(newPrices).slice(-500);
  for (const key of priceKeys) {
    recentPrices[key] = newPrices[key];
  }

  const recentVolume24h: Record<string, number> = {};
  const volKeys = Object.keys(newVolume24h).slice(-500);
  for (const key of volKeys) {
    recentVolume24h[key] = newVolume24h[key];
  }

  const nextCursor: PolymarketCursorJson = {
    last_fetch_at: new Date().toISOString(),
    seen_condition_ids: recentSeenIds.length > 0 ? recentSeenIds : undefined,
    last_prices: Object.keys(recentPrices).length > 0 ? recentPrices : undefined,
    last_volume_24h: Object.keys(recentVolume24h).length > 0 ? recentVolume24h : undefined,
  };

  return {
    rawItems: combined, // Now returns PolymarketCandidate[]
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      markets_fetched: combined.length,
      spike_count: spikeMarkets.length,
      new_count: newMarkets.length,
      filters_applied: {
        min_volume: config.min_volume,
        min_liquidity: config.min_liquidity,
        min_volume_24h: config.min_volume_24h,
        include_restricted: config.include_restricted,
        include_resolved: config.include_resolved,
        include_new_markets: config.include_new_markets,
        include_spike_markets: config.include_spike_markets,
        spike_probability_change_threshold: config.spike_probability_change_threshold,
        spike_volume_change_threshold: config.spike_volume_change_threshold,
      },
    },
  };
}
