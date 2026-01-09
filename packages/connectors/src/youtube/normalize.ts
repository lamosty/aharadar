import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

export async function normalizeYoutube(
  _raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  // TODO: implement deterministic YouTube normalization.
  return {
    title: null,
    bodyText: null,
    canonicalUrl: null,
    sourceType: "youtube",
    externalId: null,
    publishedAt: null,
    author: null,
    metadata: {},
  };
}
