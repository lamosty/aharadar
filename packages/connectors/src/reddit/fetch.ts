import type { FetchParams, FetchResult } from "@aharadar/shared";

export async function fetchReddit(_params: FetchParams): Promise<FetchResult> {
  // TODO: implement Reddit fetch (public JSON endpoints; cursor-based).
  return { rawItems: [], nextCursor: {} };
}
