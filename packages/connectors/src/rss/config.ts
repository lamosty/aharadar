export interface RssSourceConfig {
  feedUrl: string;
  maxItemCount: number;
  preferContentEncoded: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBool(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function parseRssSourceConfig(config: Record<string, unknown>): RssSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const feedUrl = asString(config.feed_url) ?? asString(config.feedUrl);
  if (!feedUrl) {
    throw new Error('RSS source config must include non-empty "feedUrl" or "feed_url"');
  }

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  const preferContentEncoded = asBool(config.prefer_content_encoded ?? config.preferContentEncoded, true);

  return {
    feedUrl,
    maxItemCount,
    preferContentEncoded,
  };
}
