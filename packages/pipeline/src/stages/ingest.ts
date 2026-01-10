import { getConnector } from "@aharadar/connectors";
import type { Db, SourceRow } from "@aharadar/db";
import {
  type ContentItemDraft,
  canonicalizeUrl,
  createLogger,
  type FetchParams,
  type ProviderCallDraft,
  sha256Hex,
} from "@aharadar/shared";

const log = createLogger({ component: "ingest" });

export interface IngestLimits {
  maxItemsPerSource: number;
}

export interface IngestSourceFilter {
  onlySourceTypes?: string[];
  onlySourceIds?: string[];
}

export type IngestSourceStatus = "ok" | "partial" | "error" | "skipped";

export interface IngestSourceResult {
  sourceId: string;
  sourceType: string;
  sourceName: string;
  status: IngestSourceStatus;
  fetched: number;
  normalized: number;
  upserted: number;
  inserted: number;
  errors: number;
  error?: { message: string };
  skipReason?: string;
}

export interface IngestRunResult {
  perSource: IngestSourceResult[];
  totals: {
    sources: number;
    skipped: number;
    fetched: number;
    normalized: number;
    upserted: number;
    inserted: number;
    errors: number;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function extractProviderCalls(meta: unknown): ProviderCallDraft[] {
  const obj = asRecord(meta);
  const maybe = obj.providerCalls;
  if (!Array.isArray(maybe)) return [];
  const out: ProviderCallDraft[] = [];
  for (const entry of maybe) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<ProviderCallDraft>;
    if (
      typeof e.userId === "string" &&
      typeof e.purpose === "string" &&
      typeof e.provider === "string" &&
      typeof e.model === "string" &&
      typeof e.inputTokens === "number" &&
      typeof e.outputTokens === "number" &&
      typeof e.costEstimateCredits === "number" &&
      typeof e.meta === "object" &&
      e.meta !== null &&
      typeof e.startedAt === "string" &&
      (e.endedAt === undefined || typeof e.endedAt === "string") &&
      (e.status === "ok" || e.status === "error")
    ) {
      out.push({
        userId: e.userId,
        purpose: e.purpose,
        provider: e.provider,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        costEstimateCredits: e.costEstimateCredits,
        meta: e.meta as Record<string, unknown>,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        status: e.status,
        error: e.error as Record<string, unknown> | undefined,
      });
    }
  }
  return out;
}

function buildFetchParams(
  source: SourceRow,
  userId: string,
  windowStart: string,
  windowEnd: string,
  limits: IngestLimits,
): FetchParams {
  return {
    userId,
    sourceId: source.id,
    sourceType: source.type,
    config: asRecord(source.config_json),
    cursor: asRecord(source.cursor_json),
    limits: { maxItems: limits.maxItemsPerSource },
    windowStart,
    windowEnd,
  };
}

function stableSyntheticExternalId(params: {
  sourceId: string;
  sourceType: string;
  title: string | null;
  bodyText: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  author: string | null;
}): string {
  // Deterministic and topic-agnostic: a stable hash of the fields we have.
  const parts = [
    params.sourceId,
    params.sourceType,
    params.title ?? "",
    params.bodyText ?? "",
    params.canonicalUrl ?? "",
    params.publishedAt ?? "",
    params.author ?? "",
  ];
  return sha256Hex(parts.join("|"));
}

function draftToUpsert(draft: ContentItemDraft, source: SourceRow, userId: string) {
  const canonicalUrl = draft.canonicalUrl ? canonicalizeUrl(draft.canonicalUrl) : null;
  const hashUrl = canonicalUrl ? sha256Hex(canonicalUrl) : null;

  const externalId =
    draft.externalId ??
    (hashUrl
      ? null
      : stableSyntheticExternalId({
          sourceId: source.id,
          sourceType: source.type,
          title: draft.title,
          bodyText: draft.bodyText,
          canonicalUrl,
          publishedAt: draft.publishedAt,
          author: draft.author,
        }));

  return {
    userId,
    sourceId: source.id,
    sourceType: draft.sourceType,
    externalId,
    canonicalUrl,
    title: draft.title,
    bodyText: draft.bodyText,
    author: draft.author,
    publishedAt: draft.publishedAt,
    language: null,
    metadata: draft.metadata ?? {},
    raw: draft.raw ?? null,
    hashUrl,
    hashText: null,
  };
}

/**
 * Connectors that require paid provider calls.
 * When credits are exhausted, these should be skipped during ingest.
 */
const PAID_CONNECTOR_TYPES = new Set(["x_posts"]);

export async function ingestEnabledSources(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  limits: IngestLimits;
  filter?: IngestSourceFilter;
  /** If false, skip paid connectors (x_posts) */
  paidCallsAllowed?: boolean;
}): Promise<IngestRunResult> {
  const paidCallsAllowed = params.paidCallsAllowed ?? true;

  let sources = await params.db.sources.listEnabledByUserAndTopic({
    userId: params.userId,
    topicId: params.topicId,
  });

  const onlyTypes = (params.filter?.onlySourceTypes ?? []).filter((t) => t.trim().length > 0);
  const onlyIds = (params.filter?.onlySourceIds ?? []).filter((id) => id.trim().length > 0);

  if (onlyTypes.length > 0) {
    const set = new Set(onlyTypes);
    sources = sources.filter((s) => set.has(s.type));
  }
  if (onlyIds.length > 0) {
    const set = new Set(onlyIds);
    sources = sources.filter((s) => set.has(s.id));
  }

  const perSource: IngestSourceResult[] = [];

  const totals = {
    sources: sources.length,
    skipped: 0,
    fetched: 0,
    normalized: 0,
    upserted: 0,
    inserted: 0,
    errors: 0,
  };

  for (const source of sources) {
    const fetchParams = buildFetchParams(
      source,
      params.userId,
      params.windowStart,
      params.windowEnd,
      params.limits,
    );
    const connector = getConnector(source.type);

    const baseResult: IngestSourceResult = {
      sourceId: source.id,
      sourceType: source.type,
      sourceName: source.name,
      status: "ok",
      fetched: 0,
      normalized: 0,
      upserted: 0,
      inserted: 0,
      errors: 0,
    };

    // Budget gating: skip paid connectors when credits exhausted
    if (!paidCallsAllowed && PAID_CONNECTOR_TYPES.has(source.type)) {
      baseResult.status = "skipped";
      baseResult.skipReason = "budget_exhausted";
      perSource.push(baseResult);
      totals.skipped += 1;
      continue;
    }

    const fetchRun = await params.db.fetchRuns.start(source.id, asRecord(source.cursor_json));

    try {
      if (!connector) {
        throw new Error(`No connector registered for source.type="${source.type}"`);
      }

      const fetchResult = await connector.fetch(fetchParams);
      baseResult.fetched = fetchResult.rawItems.length;
      totals.fetched += baseResult.fetched;

      // Accounting hooks (e.g. signal search).
      const providerCalls = extractProviderCalls(fetchResult.meta);
      const providerCallErrorCount = providerCalls.filter((c) => c.status === "error").length;
      if (providerCallErrorCount > 0) {
        baseResult.errors += providerCallErrorCount;
        totals.errors += providerCallErrorCount;
      }
      for (const call of providerCalls) {
        try {
          await params.db.providerCalls.insert(call);
        } catch (err) {
          // Provider call accounting failures should not abort ingestion.
          baseResult.errors += 1;
          totals.errors += 1;
          log.warn({ err }, "provider_calls insert failed");
        }
      }

      for (const raw of fetchResult.rawItems) {
        try {
          const draft = await connector.normalize(raw, fetchParams);
          baseResult.normalized += 1;
          totals.normalized += 1;

          const upsert = draftToUpsert(draft, source, params.userId);
          const upsertRes = await params.db.contentItems.upsert(upsert);

          baseResult.upserted += 1;
          totals.upserted += 1;
          if (upsertRes.inserted) {
            baseResult.inserted += 1;
            totals.inserted += 1;
          }

          // Record provenance / topic membership via (content_item, source).
          try {
            await params.db.contentItemSources.upsert({
              contentItemId: upsertRes.id,
              sourceId: source.id,
            });
          } catch (err) {
            // This mapping is helpful for topic scoping, but failures should not abort ingest.
            baseResult.errors += 1;
            totals.errors += 1;
            log.warn({ err }, "content_item_sources upsert failed");
          }
        } catch (err) {
          baseResult.errors += 1;
          totals.errors += 1;
          log.warn({ err }, "normalize/upsert failed");
        }
      }

      baseResult.status = baseResult.errors > 0 ? "partial" : "ok";

      // Cursor updates happen only after a successful fetch call (ok/partial).
      // Track last_fetch_at for debugging/future use.
      const updatedCursor = {
        ...asRecord(fetchResult.nextCursor),
        last_fetch_at: params.windowEnd,
      };
      await params.db.sources.updateCursor(source.id, updatedCursor);

      await params.db.fetchRuns.finish({
        fetchRunId: fetchRun.id,
        status: baseResult.status,
        cursorOut: updatedCursor,
        counts: {
          fetched: baseResult.fetched,
          normalized: baseResult.normalized,
          upserted: baseResult.upserted,
          inserted: baseResult.inserted,
          errors: baseResult.errors,
        },
      });

      perSource.push(baseResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      baseResult.status = "error";
      baseResult.error = { message };
      baseResult.errors += 1;
      totals.errors += 1;

      await params.db.fetchRuns.finish({
        fetchRunId: fetchRun.id,
        status: "error",
        cursorOut: asRecord(source.cursor_json),
        counts: {
          fetched: baseResult.fetched,
          normalized: baseResult.normalized,
          upserted: baseResult.upserted,
          inserted: baseResult.inserted,
          errors: baseResult.errors,
        },
        error: { message },
      });

      perSource.push(baseResult);
    }
  }

  return { perSource, totals };
}
