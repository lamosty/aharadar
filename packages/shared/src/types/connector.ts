export type SourceType = "reddit" | "hn" | "rss" | "youtube" | "signal" | string;

export type Cursor = Record<string, unknown>;

export interface FetchParams {
  userId: string;
  sourceId: string;
  sourceType: SourceType;
  config: Record<string, unknown>;
  cursor: Cursor;
  limits: {
    maxItems: number;
    maxComments?: number;
  };
  windowStart: string; // ISO
  windowEnd: string; // ISO
}

export interface FetchResult {
  rawItems: unknown[];
  nextCursor: Cursor;
  meta?: Record<string, unknown>;
}


