import type { FetchParams, FetchResult } from "@aharadar/shared";

import { fetchRss } from "../rss/fetch";
import type { Connector } from "../types";
import { parseMediumSourceConfig } from "./config";
import { normalizeMedium } from "./normalize";

/**
 * Medium connector that wraps the RSS fetcher.
 * Transforms Medium user/publication config to RSS feed URL before fetching.
 */
async function fetchMedium(params: FetchParams): Promise<FetchResult> {
  const mediumConfig = parseMediumSourceConfig(params.config);

  // Transform params to RSS-compatible config
  const rssParams: FetchParams = {
    ...params,
    config: {
      feedUrl: mediumConfig.feedUrl,
      maxItemCount: mediumConfig.maxItemCount,
      preferContentEncoded: true, // Medium uses content:encoded for full content
    },
  };

  return fetchRss(rssParams);
}

export const mediumConnector: Connector = {
  sourceType: "medium",
  fetch: fetchMedium,
  normalize: normalizeMedium,
};

export type { MediumSourceConfig } from "./config";
export { parseMediumSourceConfig } from "./config";
