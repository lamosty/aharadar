export interface HnSourceConfig {
  feed: "top" | "new";
  // Comments are out-of-scope for MVP
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asFeed(value: unknown): "top" | "new" | null {
  const s = asString(value);
  if (s === "top" || s === "new") return s;
  return null;
}

export function parseHnSourceConfig(config: Record<string, unknown>): HnSourceConfig {
  // Accept both snake_case and camelCase for flexibility
  const feed = asFeed(config.feed) ?? "top";

  return { feed };
}
