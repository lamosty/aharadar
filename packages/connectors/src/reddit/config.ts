export interface RedditSourceConfig {
  /** Single subreddit name (without r/ prefix) */
  subreddit: string;
  listing?: "new" | "top" | "hot";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  includeComments?: boolean;
  maxCommentCount?: number;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asBool(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asListing(value: unknown): RedditSourceConfig["listing"] {
  return value === "new" || value === "top" || value === "hot" ? value : undefined;
}

function asTimeFilter(value: unknown): RedditSourceConfig["timeFilter"] {
  return value === "hour" ||
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "year" ||
    value === "all"
    ? value
    : undefined;
}

export function parseRedditSourceConfig(config: Record<string, unknown>): RedditSourceConfig {
  // Support both new 'subreddit' (string) and legacy 'subreddits' (array, takes first)
  let subreddit = asString(config.subreddit);
  if (!subreddit && Array.isArray(config.subreddits) && config.subreddits.length > 0) {
    subreddit = asString(config.subreddits[0]);
  }

  return {
    subreddit,
    listing: asListing(config.listing) ?? "new",
    timeFilter: asTimeFilter(config.time_filter) ?? asTimeFilter(config.timeFilter) ?? "day",
    includeComments: asBool(config.include_comments ?? config.includeComments, false),
    maxCommentCount: Math.max(
      0,
      Math.floor(asNumber(config.max_comment_count ?? config.maxCommentCount, 0)),
    ),
  };
}
