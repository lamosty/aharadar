export interface ContentItemDraft {
  title: string | null;
  bodyText: string | null;
  canonicalUrl: string | null;
  sourceType: string;
  externalId: string | null;
  publishedAt: string | null; // ISO
  author: string | null;
  metadata: Record<string, unknown>;
  raw?: unknown;
}


