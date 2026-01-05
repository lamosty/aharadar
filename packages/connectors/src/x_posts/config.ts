/**
 * X/Twitter posts connector config (ADR 0010).
 *
 * Similar to signal config but for canonical post ingestion.
 * Uses Grok as the default access method.
 */
export interface XPostsSourceConfig {
  vendor: "grok" | string;

  // Primary UX: accounts to follow
  accounts?: string[];

  // Optional: topic keywords
  keywords?: string[];

  // Advanced escape hatch: raw queries
  queries?: string[];

  maxResultsPerQuery?: number;

  // X-specific query hygiene
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
}
