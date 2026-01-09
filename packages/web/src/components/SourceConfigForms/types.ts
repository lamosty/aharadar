/**
 * Type definitions for source configuration forms.
 */

// RSS Source Config
export interface RssConfig {
  feedUrl: string;
  maxItemCount?: number;
  preferContentEncoded?: boolean;
}

// Reddit Source Config
export interface RedditConfig {
  subreddit: string;
  listing?: "new" | "top" | "hot";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  includeComments?: boolean;
  maxCommentCount?: number;
}

// Hacker News Source Config
export interface HnConfig {
  feed?: "top" | "new";
}

// YouTube Source Config
export interface YoutubeConfig {
  channelId: string;
  maxVideoCount?: number;
  includeTranscript?: boolean;
}

// X Posts Source Config
export interface XPostsConfig {
  vendor: "grok" | string;
  accounts?: string[];
  keywords?: string[];
  queries?: string[];
  maxResultsPerQuery?: number;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
}

// Signal Source Config
export interface SignalConfig {
  provider: "x_search" | string;
  vendor: "grok" | string;
  accounts?: string[];
  keywords?: string[];
  queries?: string[];
  maxResultsPerQuery?: number;
  extractUrls?: boolean;
  extractEntities?: boolean;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
}

// SEC EDGAR Source Config
export interface SecEdgarConfig {
  filing_types: ("form4" | "13f")[];
  tickers?: string[];
  ciks?: string[];
  min_transaction_value?: number;
  max_filings_per_fetch?: number;
}

// Congress Trading Source Config
export interface CongressTradingConfig {
  vendor?: "stock_watcher" | "quiver" | string;
  politicians?: string[];
  chambers?: ("senate" | "house")[];
  min_amount?: number;
  transaction_types?: ("purchase" | "sale")[];
  tickers?: string[];
  max_trades_per_fetch?: number;
}

// Polymarket Source Config
export interface PolymarketConfig {
  categories?: string[];
  min_volume?: number;
  min_liquidity?: number;
  probability_change_threshold?: number;
  include_resolved?: boolean;
  max_markets_per_fetch?: number;
}

// Options Flow Source Config
export interface OptionsFlowConfig {
  symbols?: string[];
  min_premium?: number;
  flow_types?: ("sweep" | "block" | "unusual")[];
  sentiment_filter?: "bullish" | "bearish";
  include_etfs?: boolean;
  expiry_max_days?: number;
  max_alerts_per_fetch?: number;
}

// Market Sentiment Source Config
export interface MarketSentimentConfig {
  tickers?: string[];
  sentiment_change_threshold?: number;
  min_mentions?: number;
  alert_on_extreme?: boolean;
  extreme_threshold?: number;
  max_tickers_per_fetch?: number;
}

// Union type for all configs
export type SourceTypeConfig =
  | RssConfig
  | RedditConfig
  | HnConfig
  | YoutubeConfig
  | XPostsConfig
  | SignalConfig
  | SecEdgarConfig
  | CongressTradingConfig
  | PolymarketConfig
  | OptionsFlowConfig
  | MarketSentimentConfig;

// Form props interface
export interface SourceConfigFormProps<T> {
  value: Partial<T>;
  onChange: (config: Partial<T>) => void;
  errors?: Record<string, string>;
}
