import type { ContentItemDraft, FetchParams, FetchResult, SourceType } from "@aharadar/shared";

export interface Connector {
  sourceType: SourceType;
  fetch(params: FetchParams): Promise<FetchResult>;
  normalize(raw: unknown, params: FetchParams): Promise<ContentItemDraft>;
}
