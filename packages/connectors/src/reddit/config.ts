export interface RedditSourceConfig {
  subreddits: string[];
  listing?: "new" | "top" | "hot";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  includeComments?: boolean;
  maxCommentCount?: number;
  includeNsfw?: boolean;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
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
  const subreddits = asStringArray(config.subreddits);
  return {
    subreddits,
    listing: asListing(config.listing) ?? "new",
    timeFilter: asTimeFilter(config.time_filter) ?? asTimeFilter(config.timeFilter) ?? "day",
    includeComments: asBool(config.include_comments ?? config.includeComments, false),
    maxCommentCount: Math.max(0, Math.floor(asNumber(config.max_comment_count ?? config.maxCommentCount, 0))),
    includeNsfw: asBool(config.include_nsfw ?? config.includeNsfw, false),
  };
}
