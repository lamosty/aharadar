import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { generateMarketId, type PolymarketRawMarket, parseProbability, parseVolume } from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
 * Format: "{Question} - {X}%" or "{Question} - Now {X}% ({change} 24h)"
 */
function generateTitle(market: PolymarketRawMarket, probChange: number | null): string {
  const probability =
    market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) * 100 : 0;
  const probStr = probability.toFixed(0);

  if (probChange !== null && Math.abs(probChange) >= 5) {
    const direction = probChange > 0 ? "+" : "";
    return `${market.question} - ${probStr}% (${direction}${probChange.toFixed(0)}pp)`;
  }

  return `${market.question} - ${probStr}%`;
}

/**
 * Generate body text with market details
 */
function generateBodyText(market: PolymarketRawMarket, probChange: number | null): string {
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

  body += `\n\nCurrent Probability: ${probability.toFixed(1)}%`;

  if (probChange !== null) {
    const direction = probChange > 0 ? "+" : "";
    body += ` (${direction}${probChange.toFixed(1)}pp since last check)`;
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
 */
export async function normalizePolymarket(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const market = asRecord(raw) as unknown as PolymarketRawMarket;

  // Validate required fields
  if (!market.conditionId || !market.question) {
    throw new Error("Malformed Polymarket market: missing required fields (conditionId, question)");
  }

  // Calculate probability change from cursor if available
  let probChange: number | null = null;
  const currentProb =
    market.outcomePrices.length > 0 ? parseProbability(market.outcomePrices[0]) : 0;
  const lastPrices = params.cursor?.last_prices as Record<string, number> | undefined;
  if (lastPrices && market.conditionId in lastPrices) {
    probChange = (currentProb - lastPrices[market.conditionId]) * 100;
  }

  const marketId = generateMarketId(market);
  const title = generateTitle(market, probChange);
  const bodyText = generateBodyText(market, probChange);
  const canonicalUrl = buildCanonicalUrl(market);

  const volume = parseVolume(market.volume);
  const volume24hr = parseVolume(market.volume24hr);
  const liquidity = parseVolume(market.liquidity);
  const spread = parseFloat(market.spread) || 0;
  const daysToResolution = calculateDaysToResolution(market.endDateIso);

  // Use market creation date as published date
  let publishedAt: string | null = null;
  if (market.createdAt) {
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
    outcome_prices: market.outcomePrices.map((p) => parseProbability(p)),
    is_active: market.active,
    is_closed: market.closed,
    resolution_status: market.closed ? "resolved" : "open",
    end_date: market.endDateIso,
  };

  if (probChange !== null) {
    metadata.probability_change = probChange;
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
    },
  };
}
