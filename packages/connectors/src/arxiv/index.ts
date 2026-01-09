import type { FetchParams, FetchResult } from "@aharadar/shared";

import { fetchRss } from "../rss/fetch";
import type { Connector } from "../types";
import { parseArxivSourceConfig } from "./config";
import { normalizeArxiv } from "./normalize";

/**
 * Fetch arXiv RSS feed using the RSS fetcher but with arXiv-specific config parsing.
 * This transforms the arXiv config (with category) into an RSS-compatible config.
 */
async function fetchArxiv(params: FetchParams): Promise<FetchResult> {
  const arxivConfig = parseArxivSourceConfig(params.config);

  // Transform to RSS-compatible config
  const rssParams: FetchParams = {
    ...params,
    config: {
      feedUrl: arxivConfig.feedUrl,
      maxItemCount: arxivConfig.maxItemCount,
      preferContentEncoded: false, // arXiv uses description for abstract
    },
  };

  return fetchRss(rssParams);
}

export const arxivConnector: Connector = {
  sourceType: "arxiv",
  fetch: fetchArxiv,
  normalize: normalizeArxiv,
};

export type { ArxivSourceConfig } from "./config";
export { parseArxivSourceConfig } from "./config";
