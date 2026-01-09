import type { ProviderCallDraft } from "./provider_calls";

export type SourceType =
  | "reddit"
  | "hn"
  | "rss"
  | "podcast"
  | "substack"
  | "medium"
  | "youtube"
  | "signal"
  | "sec_edgar"
  | "congress_trading"
  | "polymarket"
  | "options_flow"
  | "market_sentiment"
  | "producthunt"
  | "github_releases"
  | "telegram"
  | string;

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

export interface FetchMeta extends Record<string, unknown> {
  /**
   * Optional accounting hook: connectors can emit provider call drafts (LLM, signal search, etc.)
   * and the pipeline will persist them into `provider_calls`.
   */
  providerCalls?: ProviderCallDraft[];
}

export interface FetchResult {
  rawItems: unknown[];
  nextCursor: Cursor;
  meta?: FetchMeta;
}
