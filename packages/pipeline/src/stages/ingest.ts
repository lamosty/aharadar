import { getConnector } from "@aharadar/connectors";
import type { Db, SourceRow } from "@aharadar/db";
import {
  type ContentItemDraft,
  canonicalizeUrl,
  computePolicyView,
  createLogger,
  deterministicSample,
  type FetchParams,
  MIN_SAMPLE_SIZE,
  normalizeHandle,
  type ProviderCallDraft,
  sha256Hex,
  type XAccountPolicyRow,
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

/**
 * Extract handles from x_posts config (accounts + batching.groups).
 */
function extractXPostsHandles(config: Record<string, unknown>): string[] {
  const handles = new Set<string>();

  // Extract from 'accounts' array
  if (Array.isArray(config.accounts)) {
    for (const acc of config.accounts) {
      if (typeof acc === "string" && acc.trim()) {
        handles.add(normalizeHandle(acc.trim()));
      }
    }
  }

  // Extract from 'batching.groups' (array of arrays)
  const batching = config.batching as { groups?: unknown[] } | undefined;
  if (batching && Array.isArray(batching.groups)) {
    for (const group of batching.groups) {
      if (Array.isArray(group)) {
        for (const acc of group) {
          if (typeof acc === "string" && acc.trim()) {
            handles.add(normalizeHandle(acc.trim()));
          }
        }
      }
    }
  }

  return Array.from(handles);
}

interface XPostsAccountGatingResult {
  gatedConfig: Record<string, unknown>;
  included: string[];
  excluded: string[];
  skippedGating: boolean;
}

/**
 * Apply account-level gating for x_posts sources based on feedback-driven policies.
 * Returns a modified config with filtered accounts and batching groups.
 */
async function applyXPostsAccountGating(params: {
  db: Db;
  sourceId: string;
  config: Record<string, unknown>;
  windowEnd: string;
}): Promise<XPostsAccountGatingResult> {
  const { db, sourceId, config, windowEnd } = params;
  const now = new Date();

  // If queries are present, skip gating (explicit queries are not account-scoped)
  if (Array.isArray(config.queries) && config.queries.length > 0) {
    return {
      gatedConfig: config,
      included: [],
      excluded: [],
      skippedGating: true,
    };
  }

  // Extract all handles from config
  const allHandles = extractXPostsHandles(config);

  if (allHandles.length === 0) {
    return {
      gatedConfig: config,
      included: [],
      excluded: [],
      skippedGating: false,
    };
  }

  // Fetch policy rows (upsert defaults for any missing)
  const policyRows = await db.xAccountPolicies.upsertDefaults({
    sourceId,
    handles: allHandles,
  });

  // Build a map of handle -> policy row
  const policyMap = new Map<string, XAccountPolicyRow>();
  for (const row of policyRows) {
    policyMap.set(row.handle, row);
  }

  // Decide inclusion per handle
  const included: string[] = [];
  const excluded: string[] = [];

  for (const handle of allHandles) {
    const row = policyMap.get(handle);
    if (!row) {
      // No policy row = include (shouldn't happen after upsert, but safety)
      included.push(handle);
      continue;
    }

    const view = computePolicyView(row, now);

    if (row.mode === "always") {
      included.push(handle);
    } else if (row.mode === "mute") {
      excluded.push(handle);
    } else {
      // Auto mode
      if (view.sample < MIN_SAMPLE_SIZE) {
        // Not enough samples yet - include to gather data
        included.push(handle);
      } else {
        // Use deterministic sampling
        const key = `${sourceId}|${handle}|${windowEnd}`;
        if (deterministicSample(key, view.throttle)) {
          included.push(handle);
        } else {
          excluded.push(handle);
        }
      }
    }
  }

  // Build gated config
  const includedSet = new Set(included);
  const gatedConfig = { ...config };

  // Filter accounts array
  if (Array.isArray(config.accounts)) {
    gatedConfig.accounts = config.accounts.filter((acc: unknown) => {
      if (typeof acc !== "string") return false;
      return includedSet.has(normalizeHandle(acc.trim()));
    });
  }

  // Filter batching.groups
  if (config.batching && typeof config.batching === "object") {
    const batching = config.batching as { groups?: unknown[]; mode?: string };
    if (Array.isArray(batching.groups)) {
      const filteredGroups = batching.groups
        .map((group: unknown) => {
          if (!Array.isArray(group)) return [];
          return group.filter((acc: unknown) => {
            if (typeof acc !== "string") return false;
            return includedSet.has(normalizeHandle(acc.trim()));
          });
        })
        .filter((group) => group.length > 0);

      gatedConfig.batching = {
        ...batching,
        groups: filteredGroups,
      };
    }
  }

  return {
    gatedConfig,
    included,
    excluded,
    skippedGating: false,
  };
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

    // X account policy gating: filter accounts based on feedback-driven throttling
    let effectiveFetchParams = fetchParams;
    if (source.type === "x_posts") {
      try {
        const gatingResult = await applyXPostsAccountGating({
          db: params.db,
          sourceId: source.id,
          config: fetchParams.config,
          windowEnd: params.windowEnd,
        });

        if (!gatingResult.skippedGating) {
          // Log included/excluded counts for transparency
          if (gatingResult.excluded.length > 0) {
            log.info(
              {
                sourceId: source.id,
                sourceName: source.name,
                included: gatingResult.included.length,
                excluded: gatingResult.excluded.length,
                excludedHandles: gatingResult.excluded,
              },
              "x_posts account gating applied",
            );
          }

          // Use gated config
          effectiveFetchParams = {
            ...fetchParams,
            config: gatingResult.gatedConfig,
          };
        }
      } catch (err) {
        // Log but don't fail - account gating is non-critical
        log.warn(
          { err, sourceId: source.id },
          "Failed to apply X account gating, proceeding with full config",
        );
      }
    }

    const fetchRun = await params.db.fetchRuns.start(source.id, asRecord(source.cursor_json));

    try {
      if (!connector) {
        throw new Error(`No connector registered for source.type="${source.type}"`);
      }

      const fetchResult = await connector.fetch(effectiveFetchParams);
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
          const draft = await connector.normalize(raw, effectiveFetchParams);
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
