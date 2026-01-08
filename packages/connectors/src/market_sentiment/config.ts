export interface MarketSentimentSourceConfig {
  /** Stock tickers to monitor (required) */
  tickers: string[];
  /** Only emit if sentiment score changed by this percentage since last fetch, default 0 */
  sentiment_change_threshold?: number;
  /** Minimum mention count to include, default 0 */
  min_mentions?: number;
  /** Emit item when sentiment is extremely bullish/bearish, default false */
  alert_on_extreme?: boolean;
  /** Threshold for extreme sentiment (0-1 scale), default 0.8 */
  extreme_threshold?: number;
  /** Max tickers to process per fetch to respect rate limits, default 10 */
  max_tickers_per_fetch?: number;
}

function asUpperStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toUpperCase() : null))
    .filter((v) => v !== null && v.length > 0) as string[];
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function parseMarketSentimentSourceConfig(config: Record<string, unknown>): MarketSentimentSourceConfig {
  const tickers = asUpperStringArray(config.tickers);
  const sentimentChangeThreshold = Math.max(
    0,
    asNumber(config.sentiment_change_threshold ?? config.sentimentChangeThreshold, 0)
  );
  const minMentions = Math.max(0, Math.floor(asNumber(config.min_mentions ?? config.minMentions, 0)));
  const alertOnExtreme = asBoolean(config.alert_on_extreme ?? config.alertOnExtreme, false);
  const extremeThreshold = Math.max(
    0.5,
    Math.min(1, asNumber(config.extreme_threshold ?? config.extremeThreshold, 0.8))
  );
  const maxTickersPerFetch = Math.max(
    1,
    Math.min(30, Math.floor(asNumber(config.max_tickers_per_fetch ?? config.maxTickersPerFetch, 10)))
  );

  return {
    tickers,
    sentiment_change_threshold: sentimentChangeThreshold,
    min_mentions: minMentions,
    alert_on_extreme: alertOnExtreme,
    extreme_threshold: extremeThreshold,
    max_tickers_per_fetch: maxTickersPerFetch,
  };
}
