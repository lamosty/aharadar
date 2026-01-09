export interface MediumSourceConfig {
  username: string | null; // e.g., "@username" or "username"
  publication: string | null; // e.g., "netflix-techblog"
  feedUrl: string; // computed or provided directly
  maxItemCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

/**
 * Normalize username to ensure it starts with @
 */
function normalizeUsername(username: string): string {
  return username.startsWith("@") ? username : `@${username}`;
}

export function parseMediumSourceConfig(config: Record<string, unknown>): MediumSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const username = asString(config.username);
  const publication = asString(config.publication);
  const feedUrlProvided = asString(config.feed_url) ?? asString(config.feedUrl);

  // Construct feed URL based on provided config
  let feedUrl: string;
  if (feedUrlProvided) {
    feedUrl = feedUrlProvided;
  } else if (username) {
    // Medium user feed: https://medium.com/feed/@username
    const normalizedUsername = normalizeUsername(username);
    feedUrl = `https://medium.com/feed/${normalizedUsername}`;
  } else if (publication) {
    // Medium publication feed: https://medium.com/feed/{publication}
    feedUrl = `https://medium.com/feed/${publication}`;
  } else {
    throw new Error(
      'Medium source config must include "username" (e.g., "@username"), "publication" (e.g., "netflix-techblog"), or "feedUrl"/"feed_url"',
    );
  }

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  return {
    username,
    publication,
    feedUrl,
    maxItemCount,
  };
}
