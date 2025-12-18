import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

export async function normalizeHn(_raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  // TODO: implement deterministic HN normalization.
  return {
    title: null,
    bodyText: null,
    canonicalUrl: null,
    sourceType: "hn",
    externalId: null,
    publishedAt: null,
    author: null,
    metadata: {},
  };
}
