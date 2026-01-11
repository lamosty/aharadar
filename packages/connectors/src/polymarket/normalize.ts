import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import {
  generateMarketId,
  type PolymarketCandidate,
  type PolymarketRawMarket,
  parseProbability,
  parseVolume,
} from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Type guard to check if raw is a PolymarketCandidate
 */
function isPolymarketCandidate(raw: unknown): raw is PolymarketCandidate {
  return (
    raw !== null && typeof raw === "object" && "market" in raw && "isNew" in raw && "isSpike" in raw
  );
}

/**
 * Format volume for display
 */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

/**
 * Calculate days until resolution
 */
function calculateDaysToResolution(endDateIso: string): number | null {
  try {
    const endDate = new Date(endDateIso);
    if (Number.isNaN(endDate.getTime())) return null;
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

/**
 * Generate a descriptive title for the market
 * Format:
 *   - New market: "{Question} - {X}%"
 *   - Spike (prob): "{Question} - {X}% ({+/-N}pp)"
 *   - Spike (volume): "{Question} - {X}% (vol +N%)"
 *   - Spike (both): "{Question} - {X}% ({+/-N}pp, vol +N%)"
 */
function generateTitle(
  market: PolymarketRawMarket,
  isSpike: boolean,
  spikeReason: "probability" | "volume" | "both" | null,
  probChangePP: number | null,
  volChangePct: number | null,
): string {
  const probability =
    market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) * 100 : 0;
  const probStr = probability.toFixed(0);

  if (isSpike && spikeReason) {
    const parts: string[] = [];

    if ((spikeReason === "probability" || spikeReason === "both") && probChangePP !== null) {
      const direction = probChangePP > 0 ? "+" : "";
      parts.push(`${direction}${probChangePP.toFixed(0)}pp`);
    }

    if ((spikeReason === "volume" || spikeReason === "both") && volChangePct !== null) {
      const direction = volChangePct > 0 ? "+" : "";
      parts.push(`vol ${direction}${volChangePct.toFixed(0)}%`);
    }

    if (parts.length > 0) {
      return `${market.question} - ${probStr}% (${parts.join(", ")})`;
    }
  }

  return `${market.question} - ${probStr}%`;
}

/**
 * Generate body text with market details
 */
function generateBodyText(
  market: PolymarketRawMarket,
  isNew: boolean,
  isSpike: boolean,
  spikeReason: "probability" | "volume" | "both" | null,
  probChangePP: number | null,
  volChangePct: number | null,
  volChangeAbs: number | null,
): string {
  const probability =
    market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) * 100 : 0;
  const volume = parseVolume(market.volume);
  const volume24hr = parseVolume(market.volume24hr);
  const liquidity = parseVolume(market.liquidity);
  const spread = parseFloat(market.spread) || 0;
  const daysToResolution = calculateDaysToResolution(market.endDateIso);

  let body = market.question;

  if (market.description) {
    body += `\n\n${market.description.slice(0, 500)}`;
    if (market.description.length > 500) body += "...";
  }

  // Add spike context at the top if applicable
  if (isSpike && spikeReason) {
    body += `\n\n**Spike Alert**:`;
    if (spikeReason === "probability" || spikeReason === "both") {
      const direction = (probChangePP ?? 0) > 0 ? "+" : "";
      body += ` Probability moved ${direction}${(probChangePP ?? 0).toFixed(1)}pp`;
    }
    if (spikeReason === "volume" || spikeReason === "both") {
      const direction = (volChangePct ?? 0) > 0 ? "+" : "";
      const volAbsStr = volChangeAbs !== null ? ` (${formatVolume(Math.abs(volChangeAbs))})` : "";
      if (spikeReason === "both") {
        body += ` |`;
      }
      body += ` 24h volume ${direction}${(volChangePct ?? 0).toFixed(0)}%${volAbsStr}`;
    }
  } else if (isNew) {
    body += `\n\n**New Market**`;
  }

  body += `\n\nCurrent Probability: ${probability.toFixed(1)}%`;

  if (probChangePP !== null && !isSpike) {
    const direction = probChangePP > 0 ? "+" : "";
    body += ` (${direction}${probChangePP.toFixed(1)}pp since last check)`;
  }

  body += `\n\nMarket Stats:`;
  body += `\n  Volume: ${formatVolume(volume)}`;
  body += `\n  24h Volume: ${formatVolume(volume24hr)}`;
  body += `\n  Liquidity: ${formatVolume(liquidity)}`;
  body += `\n  Spread: ${(spread * 100).toFixed(1)}%`;

  if (daysToResolution !== null) {
    body += `\n  Resolves in: ${daysToResolution} days`;
  }

  if (market.resolutionSource) {
    body += `\n  Resolution Source: ${market.resolutionSource}`;
  }

  body += `\n\nOutcomes: ${market.outcomes.join(" / ")}`;

  return body;
}

/**
 * Build canonical URL for the market
 */
function buildCanonicalUrl(market: PolymarketRawMarket): string {
  // Use event slug if available, otherwise use condition ID
  if (market.events && market.events.length > 0 && market.events[0].slug) {
    return `https://polymarket.com/event/${market.events[0].slug}`;
  }
  return `https://polymarket.com/market/${market.conditionId}`;
}

/**
 * Normalize Polymarket market to ContentItemDraft
 * Accepts either PolymarketCandidate (new format) or PolymarketRawMarket (legacy)
 */
export async function normalizePolymarket(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  // Extract market and candidate fields
  let market: PolymarketRawMarket;
  let isNew = false;
  let isSpike = false;
  let spikeReason: "probability" | "volume" | "both" | null = null;
  let probChangePP: number | null = null;
  let volChangePct: number | null = null;
  let volChangeAbs: number | null = null;
  let observedAt: string | null = null;

  if (isPolymarketCandidate(raw)) {
    // New format: PolymarketCandidate
    market = raw.market;
    isNew = raw.isNew;
    isSpike = raw.isSpike;
    spikeReason = raw.spikeReason;
    probChangePP = raw.probabilityChangePP;
    volChangePct = raw.volume24hChangePct;
    volChangeAbs = raw.volume24hChangeAbs;
    observedAt = raw.observedAt;
  } else {
    // Legacy format: PolymarketRawMarket
    market = asRecord(raw) as unknown as PolymarketRawMarket;

    // Calculate probability change from cursor if available (legacy behavior)
    const currentProb =
      market.outcomePrices?.length > 0 ? parseProbability(market.outcomePrices[0]) : 0;
    const lastPrices = params.cursor?.last_prices as Record<string, number> | undefined;
    if (lastPrices && market.conditionId in lastPrices) {
      probChangePP = (currentProb - lastPrices[market.conditionId]) * 100;
    }
  }

  // Validate required fields
  if (!market.conditionId || !market.question) {
    throw new Error("Malformed Polymarket market: missing required fields (conditionId, question)");
  }

  const currentProb =
    market.outcomePrices?.length > 0 ? parseProbability(market.outcomePrices[0]) : 0;

  const marketId = generateMarketId(market);
  const title = generateTitle(market, isSpike, spikeReason, probChangePP, volChangePct);
  const bodyText = generateBodyText(
    market,
    isNew,
    isSpike,
    spikeReason,
    probChangePP,
    volChangePct,
    volChangeAbs,
  );
  const canonicalUrl = buildCanonicalUrl(market);

  const volume = parseVolume(market.volume);
  const volume24hr = parseVolume(market.volume24hr);
  const liquidity = parseVolume(market.liquidity);
  const spread = parseFloat(market.spread) || 0;
  const daysToResolution = calculateDaysToResolution(market.endDateIso);

  // Determine published_at:
  // - New market -> market.createdAt
  // - Spike market -> observedAt (spike observation time)
  // - Legacy -> market.createdAt
  let publishedAt: string | null = null;
  if (isSpike && observedAt) {
    // Spike: use observation time to re-enter daily window
    publishedAt = observedAt;
  } else if (market.createdAt) {
    try {
      const date = new Date(market.createdAt);
      if (!Number.isNaN(date.getTime())) {
        publishedAt = date.toISOString();
      }
    } catch {
      publishedAt = null;
    }
  }

  const metadata: Record<string, unknown> = {
    condition_id: market.conditionId,
    question_id: market.questionID,
    question: market.question,
    probability: currentProb,
    probability_percent: currentProb * 100,
    volume: volume,
    volume_24h: volume24hr,
    liquidity: liquidity,
    spread: spread,
    outcomes: market.outcomes,
    outcome_prices: market.outcomePrices?.map((p) => parseProbability(p)) ?? [],
    is_active: market.active,
    is_closed: market.closed,
    resolution_status: market.closed ? "resolved" : "open",
    end_date: market.endDateIso,

    // New/spike detection fields
    is_new: isNew,
    is_spike: isSpike,
    spike_reason: spikeReason,
    probability_change_pp: probChangePP,
    volume_24h_change_pct: volChangePct,
    volume_24h_change_abs: volChangeAbs,
    market_created_at: market.createdAt ?? null,
    market_updated_at: market.updatedAt ?? null,
    is_restricted: market.restricted ?? false,
  };

  // Legacy field for backward compat
  if (probChangePP !== null) {
    metadata.probability_change = probChangePP;
  }

  if (daysToResolution !== null) {
    metadata.days_to_resolution = daysToResolution;
  }

  if (market.resolutionSource) {
    metadata.resolution_source = market.resolutionSource;
  }

  if (market.events && market.events.length > 0) {
    metadata.event_id = market.events[0].id;
    metadata.event_slug = market.events[0].slug;
    metadata.event_title = market.events[0].title;
  }

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "polymarket",
    externalId: marketId,
    publishedAt,
    author: "Polymarket",
    metadata,
    raw: {
      condition_id: market.conditionId,
      question: market.question,
      outcomes: market.outcomes,
      outcome_prices: market.outcomePrices,
      volume: market.volume,
      liquidity: market.liquidity,
      active: market.active,
      closed: market.closed,
      end_date: market.endDateIso,
      restricted: market.restricted,
    },
  };
}
