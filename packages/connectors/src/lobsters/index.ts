import type { FetchParams, FetchResult } from "@aharadar/shared";
import { fetchRss } from "../rss/fetch";
import type { Connector } from "../types";
import { parseLobstersSourceConfig } from "./config";
import { normalizeLobsters } from "./normalize";

/**
 * Custom fetch that wraps RSS fetch with Lobsters config parsing.
 * This allows Lobsters-specific config (tag filter, default URL) while
 * reusing the RSS fetch logic.
 */
async function fetchLobsters(params: FetchParams): Promise<FetchResult> {
  const lobstersConfig = parseLobstersSourceConfig(params.config);

  // Transform to RSS-compatible config
  const rssParams: FetchParams = {
    ...params,
    config: {
      feedUrl: lobstersConfig.feedUrl,
      maxItemCount: lobstersConfig.maxItemCount,
      preferContentEncoded: false, // Lobste.rs uses description
    },
  };

  return fetchRss(rssParams);
}

export const lobstersConnector: Connector = {
  sourceType: "lobsters",
  fetch: fetchLobsters,
  normalize: normalizeLobsters,
};

export type { LobstersSourceConfig } from "./config";
export { parseLobstersSourceConfig } from "./config";
