export interface ProductHuntSourceConfig {
  feedUrl: string;
  maxItemCount: number;
}

const DEFAULT_FEED_URL = "https://www.producthunt.com/feed";
const DEFAULT_MAX_ITEM_COUNT = 50;
const MAX_ALLOWED_ITEMS = 200;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

export function parseProductHuntSourceConfig(
  config: Record<string, unknown>,
): ProductHuntSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const feedUrl = asString(config.feed_url) ?? asString(config.feedUrl) ?? DEFAULT_FEED_URL;

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(
    1,
    Math.min(MAX_ALLOWED_ITEMS, asNumber(maxRaw, DEFAULT_MAX_ITEM_COUNT)),
  );

  return {
    feedUrl,
    maxItemCount,
  };
}
