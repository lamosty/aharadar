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
  subreddits: string[];
  listing?: "new" | "top" | "hot";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  includeComments?: boolean;
  maxCommentCount?: number;
  includeNsfw?: boolean;
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

// Union type for all configs
export type SourceTypeConfig =
  | RssConfig
  | RedditConfig
  | HnConfig
  | YoutubeConfig
  | XPostsConfig
  | SignalConfig;

// Form props interface
export interface SourceConfigFormProps<T> {
  value: Partial<T>;
  onChange: (config: Partial<T>) => void;
  errors?: Record<string, string>;
}
