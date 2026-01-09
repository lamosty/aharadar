export interface ArxivSourceConfig {
  category: string; // e.g., "cs.AI", "cs.LG"
  feedUrl: string; // computed from category
  maxItemCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

/**
 * Parse arXiv source config.
 * Accepts either:
 * - `category` (e.g., "cs.AI") - will construct feed URL
 * - `feed_url` / `feedUrl` - direct feed URL override
 */
export function parseArxivSourceConfig(config: Record<string, unknown>): ArxivSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const category = asString(config.category);
  const feedUrlOverride = asString(config.feed_url) ?? asString(config.feedUrl);

  let feedUrl: string;

  if (feedUrlOverride) {
    // Direct feed URL override
    feedUrl = feedUrlOverride;
  } else if (category) {
    // Construct feed URL from category
    // arXiv RSS format: https://arxiv.org/rss/{category} or https://export.arxiv.org/rss/{category}
    feedUrl = `https://export.arxiv.org/rss/${category}`;
  } else {
    throw new Error('arXiv source config must include "category" (e.g., "cs.AI") or "feedUrl"');
  }

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  return {
    category: category ?? "",
    feedUrl,
    maxItemCount,
  };
}
