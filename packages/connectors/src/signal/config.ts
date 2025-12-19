export interface SignalSourceConfig {
  provider: "x_search" | string;
  vendor: "grok" | string;

  // Primary UX
  accounts?: string[];
  keywords?: string[];

  // Advanced escape hatch
  queries?: string[];

  maxResultsPerQuery?: number;
  extractUrls?: boolean;
  extractEntities?: boolean;

  /**
   * X-specific query hygiene (applied only when compiling queries from accounts/keywords).
   * Defaults are chosen for higher signal-to-noise.
   */
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
}
