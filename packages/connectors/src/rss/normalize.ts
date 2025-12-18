import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

export async function normalizeRss(_raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  // TODO: implement deterministic RSS normalization.
  return {
    title: null,
    bodyText: null,
    canonicalUrl: null,
    sourceType: "rss",
    externalId: null,
    publishedAt: null,
    author: null,
    metadata: {},
  };
}
