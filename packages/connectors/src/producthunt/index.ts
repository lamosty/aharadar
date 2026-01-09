import type { FetchParams, FetchResult } from "@aharadar/shared";

import { fetchRss } from "../rss/fetch";
import type { Connector } from "../types";
import { parseProductHuntSourceConfig } from "./config";
import { normalizeProductHunt } from "./normalize";

/**
 * Custom fetch function for Product Hunt that wraps RSS fetch
 * but uses Product Hunt-specific config parsing.
 */
async function fetchProductHunt(params: FetchParams): Promise<FetchResult> {
  const config = parseProductHuntSourceConfig(params.config);

  // Transform to RSS-compatible config and delegate to RSS fetcher
  const rssParams: FetchParams = {
    ...params,
    config: {
      feedUrl: config.feedUrl,
      maxItemCount: config.maxItemCount,
      preferContentEncoded: true,
    },
  };

  return fetchRss(rssParams);
}

export const producthuntConnector: Connector = {
  sourceType: "producthunt",
  fetch: fetchProductHunt,
  normalize: normalizeProductHunt,
};

export type { ProductHuntSourceConfig } from "./config";
export { parseProductHuntSourceConfig } from "./config";
