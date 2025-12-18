import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

export async function normalizeReddit(_raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  // TODO: implement deterministic Reddit normalization.
  return {
    title: null,
    bodyText: null,
    canonicalUrl: null,
    sourceType: "reddit",
    externalId: null,
    publishedAt: null,
    author: null,
    metadata: {},
  };
}
