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

// X Posts Batching Config
export interface XPostsBatchingConfig {
  mode: "off" | "manual";
  groups?: string[][];
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
  batching?: XPostsBatchingConfig;
  maxOutputTokensPerAccount?: number;
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

// Podcast Source Config
export interface PodcastConfig {
  feedUrl: string;
  maxItemCount?: number;
}

// Substack Source Config
export interface SubstackConfig {
  publication?: string;
  feedUrl?: string;
  maxItemCount?: number;
}

// Medium Source Config
export interface MediumConfig {
  username?: string;
  publication?: string;
  feedUrl?: string;
  maxItemCount?: number;
}

// arXiv Source Config
export interface ArxivConfig {
  category: string;
  maxItemCount?: number;
}

// Lobsters Source Config
export interface LobstersConfig {
  tag?: string;
  maxItemCount?: number;
}

// Product Hunt Source Config
export interface ProductHuntConfig {
  maxItemCount?: number;
}

// GitHub Releases Source Config
export interface GithubReleasesConfig {
  owner: string;
  repo: string;
  maxItemCount?: number;
}

// Telegram Source Config
export interface TelegramConfig {
  channels: string[];
  maxMessagesPerChannel?: number;
  includeMediaCaptions?: boolean;
  includeForwards?: boolean;
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
  | MarketSentimentConfig
  | PodcastConfig
  | SubstackConfig
  | MediumConfig
  | ArxivConfig
  | LobstersConfig
  | ProductHuntConfig
  | GithubReleasesConfig
  | TelegramConfig;

// Form props interface
export interface SourceConfigFormProps<T> {
  value: Partial<T>;
  onChange: (config: Partial<T>) => void;
  errors?: Record<string, string>;
}
