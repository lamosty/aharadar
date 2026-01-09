import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parseMarketSentimentSourceConfig } from "./config";

/**
 * Finnhub social sentiment data point
 */
export interface FinnhubSentimentData {
  atTime: string;
  mention: number;
  positiveScore: number;
  negativeScore: number;
  positiveMention: number;
  negativeMention: number;
  score: number; // Aggregate score
}

/**
 * Finnhub API response structure
 */
interface FinnhubSentimentResponse {
  symbol: string;
  data: FinnhubSentimentData[];
}

/**
 * Aggregated sentiment for a ticker
 */
export interface AggregatedSentiment {
  ticker: string;
  fetchedAt: string;
  dataTimestamp: string | null;
  totalMentions: number;
  positiveMentions: number;
  negativeMentions: number;
  neutralMentions: number;
  compositeScore: number;
  positiveScore: number;
  negativeScore: number;
  sentimentLabel: "bullish" | "bearish" | "neutral";
  isExtreme: boolean;
  previousScore: number | null;
  scoreChange: number | null;
}

interface MarketSentimentCursorJson {
  last_fetch_at?: string;
  ticker_scores?: Record<
    string,
    {
      score: number;
      mentions: number;
      fetched_at: string;
    }
  >;
}

function parseCursor(cursor: Record<string, unknown>): MarketSentimentCursorJson {
  const lastFetchAt = typeof cursor.last_fetch_at === "string" ? cursor.last_fetch_at : undefined;
  const tickerScores =
    cursor.ticker_scores &&
    typeof cursor.ticker_scores === "object" &&
    !Array.isArray(cursor.ticker_scores)
      ? (cursor.ticker_scores as MarketSentimentCursorJson["ticker_scores"])
      : undefined;

  return {
    last_fetch_at: lastFetchAt,
    ticker_scores: tickerScores,
  };
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch sentiment data from Finnhub for a single ticker
 */
async function fetchTickerSentiment(
  apiKey: string,
  ticker: string,
): Promise<FinnhubSentimentResponse | null> {
  const url = `https://finnhub.io/api/v1/stock/social-sentiment?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;

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
      return data as FinnhubSentimentResponse;
    }

    // Handle specific errors
    if (res.status === 401) {
      throw new Error("Finnhub API: Invalid API key (401)");
    }

    if (res.status === 403) {
      throw new Error("Finnhub API: Access denied - may require premium subscription (403)");
    }

    // Retry on rate limit or server errors
    if (res.status === 429 || res.status >= 500) {
      if (retries < maxRetries) {
        const delayMs = baseDelayMs * 2 ** retries;
        await delay(delayMs);
        retries++;
        continue;
      }
    }

    // For 404 or other client errors, return null (no data for ticker)
    if (res.status === 404) {
      return null;
    }

    const body = await res.text().catch(() => "");
    console.warn(`Finnhub API error for ${ticker} (${res.status}): ${body.slice(0, 200)}`);
    return null;
  }

  throw new Error("Finnhub API fetch failed after max retries");
}

/**
 * Get sentiment label from score
 */
export function getSentimentLabel(score: number): "bullish" | "bearish" | "neutral" {
  if (score >= 0.1) return "bullish";
  if (score <= -0.1) return "bearish";
  return "neutral";
}

/**
 * Check if sentiment is extreme
 */
export function isExtremeSentiment(score: number, threshold: number): boolean {
  // Score typically ranges from -1 to 1 for Finnhub
  // Threshold of 0.8 means score > 0.6 or < -0.6 would be extreme
  const normalizedThreshold = (threshold - 0.5) * 2; // Convert 0.5-1 to 0-1 range
  return Math.abs(score) > normalizedThreshold;
}

/**
 * Process Finnhub response into aggregated sentiment
 */
export function processSentimentData(
  response: FinnhubSentimentResponse,
  extremeThreshold: number,
  previousScore: number | null,
): AggregatedSentiment | null {
  const data = response.data;
  if (!data || data.length === 0) {
    return null;
  }

  // Use most recent data point
  const latest = data[data.length - 1];

  const totalMentions = latest.mention ?? 0;
  const positiveMentions = latest.positiveMention ?? 0;
  const negativeMentions = latest.negativeMention ?? 0;
  const neutralMentions = Math.max(0, totalMentions - positiveMentions - negativeMentions);

  const compositeScore = latest.score ?? 0;
  const positiveScore = latest.positiveScore ?? 0;
  const negativeScore = latest.negativeScore ?? 0;

  const sentimentLabel = getSentimentLabel(compositeScore);
  const isExtreme = isExtremeSentiment(compositeScore, extremeThreshold);

  let scoreChange: number | null = null;
  if (previousScore !== null && previousScore !== 0) {
    scoreChange = ((compositeScore - previousScore) / Math.abs(previousScore)) * 100;
  }

  return {
    ticker: response.symbol,
    fetchedAt: new Date().toISOString(),
    dataTimestamp: latest.atTime || null,
    totalMentions,
    positiveMentions,
    negativeMentions,
    neutralMentions,
    compositeScore,
    positiveScore,
    negativeScore,
    sentimentLabel,
    isExtreme,
    previousScore,
    scoreChange,
  };
}

/**
 * Generate a unique ID for sentiment data
 */
export function generateSentimentId(ticker: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `ms_${ticker}_${date}`;
}

/**
 * Fetch market sentiment from Finnhub API
 */
export async function fetchMarketSentiment(params: FetchParams): Promise<FetchResult> {
  const config = parseMarketSentimentSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("market_sentiment: FINNHUB_API_KEY not configured, skipping fetch");
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        skipped: true,
        reason: "FINNHUB_API_KEY not configured",
      },
    };
  }

  if (!config.tickers || config.tickers.length === 0) {
    console.warn("market_sentiment: No tickers configured");
    return {
      rawItems: [],
      nextCursor: cursorIn as Record<string, unknown>,
      meta: {
        skipped: true,
        reason: "No tickers configured",
      },
    };
  }

  const previousScores = cursorIn.ticker_scores ?? {};
  const rawItems: AggregatedSentiment[] = [];
  const newTickerScores: NonNullable<MarketSentimentCursorJson["ticker_scores"]> = {
    ...previousScores,
  };

  // Limit tickers to respect rate limits
  const tickersToProcess = config.tickers.slice(0, config.max_tickers_per_fetch ?? 10);

  for (const ticker of tickersToProcess) {
    try {
      // Rate limit: Add delay between requests (Finnhub allows 30/sec but be conservative)
      await delay(100);

      const response = await fetchTickerSentiment(apiKey, ticker);
      if (!response || !response.data || response.data.length === 0) {
        continue;
      }

      const previousData = previousScores[ticker];
      const previousScore = previousData?.score ?? null;

      const sentiment = processSentimentData(
        response,
        config.extreme_threshold ?? 0.8,
        previousScore,
      );

      if (!sentiment) {
        continue;
      }

      // Update cursor with new score
      newTickerScores[ticker] = {
        score: sentiment.compositeScore,
        mentions: sentiment.totalMentions,
        fetched_at: sentiment.fetchedAt,
      };

      // Apply filters
      // Min mentions filter
      if (config.min_mentions && config.min_mentions > 0) {
        if (sentiment.totalMentions < config.min_mentions) {
          continue;
        }
      }

      // Sentiment change threshold filter
      if (config.sentiment_change_threshold && config.sentiment_change_threshold > 0) {
        if (
          sentiment.scoreChange === null ||
          Math.abs(sentiment.scoreChange) < config.sentiment_change_threshold
        ) {
          // If not tracking extreme alerts, skip this ticker
          if (!config.alert_on_extreme) {
            continue;
          }
          // If tracking extreme and this isn't extreme, skip
          if (!sentiment.isExtreme) {
            continue;
          }
        }
      }

      // Extreme sentiment filter (if alert_on_extreme but not meeting threshold)
      if (config.alert_on_extreme && !sentiment.isExtreme) {
        // Only add if it meets change threshold
        if (!config.sentiment_change_threshold || config.sentiment_change_threshold === 0) {
          continue;
        }
      }

      rawItems.push(sentiment);
    } catch (error) {
      console.error(`market_sentiment: Error fetching ${ticker}: ${error}`);
      // Continue with other tickers
    }
  }

  const nextCursor: MarketSentimentCursorJson = {
    last_fetch_at: new Date().toISOString(),
    ticker_scores: Object.keys(newTickerScores).length > 0 ? newTickerScores : undefined,
  };

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      tickers_processed: tickersToProcess.length,
      items_returned: rawItems.length,
      filters_applied: {
        min_mentions: config.min_mentions,
        sentiment_change_threshold: config.sentiment_change_threshold,
        alert_on_extreme: config.alert_on_extreme,
        extreme_threshold: config.extreme_threshold,
      },
    },
  };
}
