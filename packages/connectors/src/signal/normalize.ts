import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

export async function normalizeSignal(_raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  // TODO: implement deterministic signal normalization.
  return {
    title: null,
    bodyText: null,
    canonicalUrl: null,
    sourceType: "signal",
    externalId: null,
    publishedAt: null,
    author: null,
    metadata: {}
  };
}


