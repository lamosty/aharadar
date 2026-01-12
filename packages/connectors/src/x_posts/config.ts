/**
 * X/Twitter posts connector config (ADR 0010).
 *
 * Similar to signal config but for canonical post ingestion.
 * Uses Grok as the default access method.
 */

/**
 * Batching config for x_posts connector.
 * Allows grouping multiple accounts into a single Grok call.
 */
export interface XPostsBatchingConfig {
  /** Batching mode: off (default), or manual (explicit groups) */
  mode: "off" | "manual";
  /** Manual groups: each group is an array of handles queried together */
  groups?: string[][];
}

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

  // Batching (experimental): group accounts into fewer Grok calls
  batching?: XPostsBatchingConfig;

  // Override max output tokens per account (scaled by group size)
  maxOutputTokensPerAccount?: number;

  /**
   * Prompt detail level for Grok responses.
   * - light (default): shorter text capture (~500 chars), cheaper
   * - heavy: longer text capture (~1500 chars), more detail, costs more tokens
   */
  promptProfile?: "light" | "heavy";

  /**
   * Fairness mode: when true, treat each account as a separate "source"
   * for sampling/triage fairness within this x_posts source.
   */
  fairnessByAccount?: boolean;
}
