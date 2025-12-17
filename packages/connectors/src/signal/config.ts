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
}


