export interface LobstersSourceConfig {
  feedUrl: string;
  tag?: string;
  maxItemCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

const DEFAULT_FEED_URL = "https://lobste.rs/rss";

export function parseLobstersSourceConfig(config: Record<string, unknown>): LobstersSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const tag = asString(config.tag);

  // Build feed URL: if tag is provided, use tag-specific feed
  let feedUrl: string;
  const configFeedUrl = asString(config.feed_url) ?? asString(config.feedUrl);

  if (configFeedUrl) {
    feedUrl = configFeedUrl;
  } else if (tag) {
    feedUrl = `https://lobste.rs/t/${tag}.rss`;
  } else {
    feedUrl = DEFAULT_FEED_URL;
  }

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  return {
    feedUrl,
    tag: tag ?? undefined,
    maxItemCount,
  };
}
