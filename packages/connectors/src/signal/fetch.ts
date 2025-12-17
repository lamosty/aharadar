import type { FetchParams, FetchResult } from "@aharadar/shared";

export async function fetchSignal(_params: FetchParams): Promise<FetchResult> {
  // TODO: implement signal fetch (MVP adapter: X/Twitter via Grok search).
  return { rawItems: [], nextCursor: {} };
}


