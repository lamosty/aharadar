import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { type AggregatedSentiment, generateSentimentId } from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Generate title for sentiment data
 */
function generateTitle(sentiment: AggregatedSentiment): string {
  const label = sentiment.sentimentLabel.charAt(0).toUpperCase() + sentiment.sentimentLabel.slice(1);
  const scoreStr = sentiment.compositeScore.toFixed(2);

  if (sentiment.scoreChange !== null && Math.abs(sentiment.scoreChange) >= 5) {
    const changeStr = sentiment.scoreChange > 0 ? `+${sentiment.scoreChange.toFixed(0)}%` : `${sentiment.scoreChange.toFixed(0)}%`;
    return `${sentiment.ticker} sentiment: ${label} (${scoreStr}, ${changeStr} change)`;
  }

  if (sentiment.isExtreme) {
    const intensity = Math.abs(sentiment.compositeScore) > 0.5 ? "Very " : "";
    return `${sentiment.ticker} sentiment: ${intensity}${label} (${scoreStr})`;
  }

  return `${sentiment.ticker} sentiment: ${label} (${scoreStr})`;
}

/**
 * Generate body text with sentiment details
 */
function generateBodyText(sentiment: AggregatedSentiment): string {
  let body = `Social sentiment analysis for ${sentiment.ticker}`;

  body += `\n\nSentiment Score: ${sentiment.compositeScore.toFixed(3)}`;
  body += `\nClassification: ${sentiment.sentimentLabel.toUpperCase()}`;

  if (sentiment.isExtreme) {
    body += ` (EXTREME)`;
  }

  if (sentiment.scoreChange !== null) {
    const direction = sentiment.scoreChange > 0 ? "up" : "down";
    body += `\nChange: ${sentiment.scoreChange > 0 ? "+" : ""}${sentiment.scoreChange.toFixed(1)}% (${direction} from previous)`;
  }

  body += `\n\nMention Breakdown:`;
  body += `\n  Total Mentions: ${sentiment.totalMentions.toLocaleString()}`;
  body += `\n  Positive: ${sentiment.positiveMentions.toLocaleString()} (${((sentiment.positiveMentions / Math.max(1, sentiment.totalMentions)) * 100).toFixed(1)}%)`;
  body += `\n  Negative: ${sentiment.negativeMentions.toLocaleString()} (${((sentiment.negativeMentions / Math.max(1, sentiment.totalMentions)) * 100).toFixed(1)}%)`;
  body += `\n  Neutral: ${sentiment.neutralMentions.toLocaleString()} (${((sentiment.neutralMentions / Math.max(1, sentiment.totalMentions)) * 100).toFixed(1)}%)`;

  body += `\n\nScore Components:`;
  body += `\n  Positive Score: ${sentiment.positiveScore.toFixed(3)}`;
  body += `\n  Negative Score: ${sentiment.negativeScore.toFixed(3)}`;

  if (sentiment.dataTimestamp) {
    body += `\n\nData as of: ${sentiment.dataTimestamp}`;
  }

  body += `\n\nSource: Finnhub Social Sentiment (aggregated from Reddit, Twitter, StockTwits)`;

  return body;
}

/**
 * Build canonical URL
 */
function buildCanonicalUrl(ticker: string): string {
  return `https://finnhub.io/api/v1/stock/social-sentiment?symbol=${ticker}`;
}

/**
 * Normalize market sentiment to ContentItemDraft
 */
export async function normalizeMarketSentiment(raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  const sentiment = asRecord(raw) as unknown as AggregatedSentiment;

  // Validate required fields
  if (!sentiment.ticker) {
    throw new Error("Malformed sentiment data: missing required field (ticker)");
  }

  const sentimentId = generateSentimentId(sentiment.ticker);
  const title = generateTitle(sentiment);
  const bodyText = generateBodyText(sentiment);
  const canonicalUrl = buildCanonicalUrl(sentiment.ticker);

  // Use data timestamp or fetched timestamp
  const publishedAt = sentiment.dataTimestamp || sentiment.fetchedAt;

  const metadata: Record<string, unknown> = {
    ticker: sentiment.ticker,
    sentiment_score: sentiment.compositeScore,
    sentiment_label: sentiment.sentimentLabel,
    is_extreme: sentiment.isExtreme,
    total_mentions: sentiment.totalMentions,
    positive_mentions: sentiment.positiveMentions,
    negative_mentions: sentiment.negativeMentions,
    neutral_mentions: sentiment.neutralMentions,
    positive_score: sentiment.positiveScore,
    negative_score: sentiment.negativeScore,
    data_timestamp: sentiment.dataTimestamp,
  };

  if (sentiment.previousScore !== null) {
    metadata.previous_score = sentiment.previousScore;
  }

  if (sentiment.scoreChange !== null) {
    metadata.score_change = sentiment.scoreChange;
  }

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "market_sentiment",
    externalId: sentimentId,
    publishedAt,
    author: "Finnhub Social Sentiment",
    metadata,
    raw: {
      ticker: sentiment.ticker,
      score: sentiment.compositeScore,
      mentions: sentiment.totalMentions,
      label: sentiment.sentimentLabel,
      fetched_at: sentiment.fetchedAt,
    },
  };
}
