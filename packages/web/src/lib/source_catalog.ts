/**
 * Source Catalog - UI metadata for source types
 *
 * This catalog provides display metadata for the source picker UI.
 * IMPORTANT: Categories and tags are UX-only and MUST NOT affect pipeline logic.
 */

import type { SupportedSourceType } from "./api";

/** Category for organizing sources in the picker */
export type SourceCategory =
  | "news"
  | "social"
  | "finance"
  | "forums"
  | "media"
  | "government"
  | "predictions";

/** Metadata for a source type */
export interface SourceCatalogEntry {
  sourceType: SupportedSourceType;
  name: string;
  description: string;
  category: SourceCategory;
  tags: string[];
  /** Requires a paid API subscription or BYO key */
  isPaid: boolean;
  /** Feature is experimental/beta */
  isExperimental: boolean;
  /** Uses credits that may add up (e.g. Grok/xAI) */
  isBudgetSensitive: boolean;
  /** Short hint about costs (shown in tooltip) */
  costHint?: string;
  /** API key providers required (shown in tooltip) */
  requiresKeyProviders?: string[];
}

/** Category display metadata */
export const CATEGORY_INFO: Record<SourceCategory, { label: string; order: number }> = {
  news: { label: "News & RSS", order: 1 },
  social: { label: "Social Media", order: 2 },
  forums: { label: "Forums & Communities", order: 3 },
  finance: { label: "Finance & Markets", order: 4 },
  government: { label: "Government & Filings", order: 5 },
  predictions: { label: "Predictions", order: 6 },
  media: { label: "Media & Video", order: 7 },
};

/** Source catalog - single source of truth for UI metadata */
export const SOURCE_CATALOG: Record<SupportedSourceType, SourceCatalogEntry> = {
  rss: {
    sourceType: "rss",
    name: "RSS / Atom Feed",
    description: "Subscribe to any RSS or Atom feed for news, blogs, or updates.",
    category: "news",
    tags: ["rss", "atom", "blog", "news"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: false,
  },
  reddit: {
    sourceType: "reddit",
    name: "Reddit",
    description: "Fetch posts from Reddit subreddits (public API, no auth).",
    category: "forums",
    tags: ["reddit", "community", "discussions"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: false,
  },
  hn: {
    sourceType: "hn",
    name: "Hacker News",
    description: "Fetch stories from Hacker News (front page, new, best, etc.).",
    category: "forums",
    tags: ["hacker news", "tech", "startups"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: false,
  },
  youtube: {
    sourceType: "youtube",
    name: "YouTube",
    description: "Fetch videos from YouTube channels or playlists.",
    category: "media",
    tags: ["youtube", "video", "channels"],
    isPaid: false,
    isExperimental: true,
    isBudgetSensitive: false,
  },
  x_posts: {
    sourceType: "x_posts",
    name: "X (Twitter) Posts",
    description: "Fetch posts from X/Twitter accounts via Grok/xAI.",
    category: "social",
    tags: ["twitter", "x", "posts", "grok"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: true,
    costHint: "Uses Grok/xAI credits",
    requiresKeyProviders: ["xai"],
  },
  signal: {
    sourceType: "signal",
    name: "Signal Search (X)",
    description: "AI-powered search of X/Twitter via Grok for signal detection.",
    category: "social",
    tags: ["twitter", "x", "search", "grok", "signal"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: true,
    costHint: "Uses Grok/xAI credits",
    requiresKeyProviders: ["xai"],
  },
  sec_edgar: {
    sourceType: "sec_edgar",
    name: "SEC EDGAR Filings",
    description: "Track SEC filings (Form 4, 13F, 8-K) for insider trades and disclosures.",
    category: "government",
    tags: ["sec", "edgar", "filings", "insider"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: false,
  },
  congress_trading: {
    sourceType: "congress_trading",
    name: "Congress Trading",
    description: "Track stock trades disclosed by U.S. Congress members.",
    category: "government",
    tags: ["congress", "trading", "disclosure", "politics"],
    isPaid: false, // Default vendor is free
    isExperimental: false,
    isBudgetSensitive: false,
  },
  polymarket: {
    sourceType: "polymarket",
    name: "Polymarket",
    description: "Track prediction market probabilities and movements.",
    category: "predictions",
    tags: ["polymarket", "predictions", "betting", "markets"],
    isPaid: false,
    isExperimental: false,
    isBudgetSensitive: false,
  },
  options_flow: {
    sourceType: "options_flow",
    name: "Options Flow",
    description: "Unusual options activity, sweeps, and large trades.",
    category: "finance",
    tags: ["options", "flow", "unusual whales", "sweeps"],
    isPaid: true,
    isExperimental: false,
    isBudgetSensitive: false,
    costHint: "Requires Unusual Whales subscription",
    requiresKeyProviders: ["unusual_whales"],
  },
  market_sentiment: {
    sourceType: "market_sentiment",
    name: "Market Sentiment",
    description: "Social sentiment data from Finnhub for stocks and crypto.",
    category: "finance",
    tags: ["sentiment", "finnhub", "social", "stocks"],
    isPaid: true,
    isExperimental: false,
    isBudgetSensitive: false,
    costHint: "Requires Finnhub API key",
    requiresKeyProviders: ["finnhub"],
  },
};

/** Get all source entries as an array, sorted by category order then name */
export function getSourceCatalogEntries(): SourceCatalogEntry[] {
  return Object.values(SOURCE_CATALOG).sort((a, b) => {
    const catOrderA = CATEGORY_INFO[a.category].order;
    const catOrderB = CATEGORY_INFO[b.category].order;
    if (catOrderA !== catOrderB) return catOrderA - catOrderB;
    return a.name.localeCompare(b.name);
  });
}

/** Get sources filtered by category */
export function getSourcesByCategory(category: SourceCategory): SourceCatalogEntry[] {
  return getSourceCatalogEntries().filter((entry) => entry.category === category);
}

/** Get all categories with their sources */
export function getSourcesGroupedByCategory(): Array<{
  category: SourceCategory;
  label: string;
  sources: SourceCatalogEntry[];
}> {
  const categories = Object.entries(CATEGORY_INFO)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([cat, info]) => ({
      category: cat as SourceCategory,
      label: info.label,
      sources: getSourcesByCategory(cat as SourceCategory),
    }))
    .filter((group) => group.sources.length > 0);

  return categories;
}

/** Search sources by query (name, description, tags) */
export function searchSources(query: string): SourceCatalogEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return getSourceCatalogEntries();

  return getSourceCatalogEntries().filter((entry) => {
    const searchable = [entry.name, entry.description, ...entry.tags].join(" ").toLowerCase();
    return searchable.includes(q);
  });
}
