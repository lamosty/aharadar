export interface SubstackSourceConfig {
  publication: string | null; // e.g., "astralcodexten" for astralcodexten.substack.com
  feedUrl: string; // computed or provided directly
  maxItemCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

export function parseSubstackSourceConfig(config: Record<string, unknown>): SubstackSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const publication = asString(config.publication);
  const feedUrlProvided = asString(config.feed_url) ?? asString(config.feedUrl);

  // If publication provided, construct feed URL; otherwise use provided feedUrl
  let feedUrl: string;
  if (feedUrlProvided) {
    feedUrl = feedUrlProvided;
  } else if (publication) {
    feedUrl = `https://${publication}.substack.com/feed`;
  } else {
    throw new Error(
      'Substack source config must include either "publication" (e.g., "astralcodexten") or "feedUrl"/"feed_url"',
    );
  }

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  return {
    publication,
    feedUrl,
    maxItemCount,
  };
}
