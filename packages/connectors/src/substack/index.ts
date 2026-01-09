import type { FetchParams, FetchResult } from "@aharadar/shared";

import { fetchRss } from "../rss/fetch";
import type { Connector } from "../types";
import { parseSubstackSourceConfig } from "./config";
import { normalizeSubstack } from "./normalize";

/**
 * Substack connector that wraps the RSS fetcher.
 * Transforms Substack publication config to RSS feed URL before fetching.
 */
async function fetchSubstack(params: FetchParams): Promise<FetchResult> {
  const substackConfig = parseSubstackSourceConfig(params.config);

  // Transform params to RSS-compatible config
  const rssParams: FetchParams = {
    ...params,
    config: {
      feedUrl: substackConfig.feedUrl,
      maxItemCount: substackConfig.maxItemCount,
      preferContentEncoded: true, // Substack uses content:encoded for full content
    },
  };

  return fetchRss(rssParams);
}

export const substackConnector: Connector = {
  sourceType: "substack",
  fetch: fetchSubstack,
  normalize: normalizeSubstack,
};

export type { SubstackSourceConfig } from "./config";
export { parseSubstackSourceConfig } from "./config";
