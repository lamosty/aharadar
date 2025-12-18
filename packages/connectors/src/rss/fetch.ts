import type { FetchParams, FetchResult } from "@aharadar/shared";

export async function fetchRss(_params: FetchParams): Promise<FetchResult> {
  // TODO: implement RSS fetch (HTTP fetch + XML parse).
  return { rawItems: [], nextCursor: {} };
}
