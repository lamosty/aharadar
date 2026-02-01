/**
 * X/Twitter posts fetch implementation (ADR 0010).
 *
 * Uses Grok as the provider to search for X posts.
 * Emits only post-level raw items (no bundles).
 * Cadence gating is handled by the pipeline (ADR 0009), not here.
 */
import type { FetchParams, FetchResult, ProviderCallDraft } from "@aharadar/shared";
import { calculateCostUsd, getXaiXSearchCostPerCall } from "@aharadar/shared";
import { grokXSearch } from "../x_shared/grok_x_search";
import type { XPostsSourceConfig } from "./config";

let lastRunKey: string | null = null;
let runSearchCallsUsed = 0;

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRunKey(params: FetchParams): string {
  return `${params.userId}|${params.windowEnd}`;
}

function resetRunBudgetIfNeeded(params: FetchParams): void {
  const runKey = getRunKey(params);
  if (lastRunKey !== runKey) {
    lastRunKey = runKey;
    runSearchCallsUsed = 0;
  }
}

function getMaxSearchCallsPerRun(): number | null {
  return parseIntEnv(
    process.env.X_POSTS_MAX_SEARCH_CALLS_PER_RUN ?? process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN,
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string") as string[];
}

function asBool(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBatchingConfig(
  value: unknown,
): { mode: "off" | "manual" | "auto"; batchSize?: number; groups?: string[][] } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const mode = obj.mode;
  if (mode !== "off" && mode !== "manual" && mode !== "auto") return undefined;
  const batchSize =
    typeof obj.batchSize === "number" && Number.isFinite(obj.batchSize) ? obj.batchSize : undefined;
  const groups = obj.groups;
  if ((mode === "manual" || mode === "auto") && Array.isArray(groups)) {
    const parsed = groups
      .filter((g): g is unknown[] => Array.isArray(g))
      .map((g) => g.filter((h): h is string => typeof h === "string" && h.trim().length > 0))
      .filter((g) => g.length > 0);
    return { mode, batchSize, groups: parsed.length > 0 ? parsed : undefined };
  }
  return { mode, batchSize };
}

function asPromptProfile(value: unknown): "light" | "heavy" | undefined {
  if (value === "light" || value === "heavy") return value;
  return undefined;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildAutoGroups(accounts: string[], batchSize: number): string[][] {
  const cleaned = accounts.map((a) => a.trim()).filter((a) => a.length > 0);
  const size = clampInt(batchSize, 1, 10);
  const out: string[][] = [];
  for (let i = 0; i < cleaned.length; i += size) out.push(cleaned.slice(i, i + size));
  return out;
}

function chunkGroup(group: string[], maxSize: number): string[][] {
  const size = clampInt(maxSize, 1, 10);
  if (group.length <= size) return [group];
  const out: string[][] = [];
  for (let i = 0; i < group.length; i += size) out.push(group.slice(i, i + size));
  return out;
}

/**
 * Convert promptProfile to maxTextChars for Grok prompt.
 * - light (default): ~500 chars - shorter, cheaper
 * - heavy: ~1500 chars - more detail, costs more tokens
 */
function getMaxTextCharsFromProfile(profile: "light" | "heavy" | undefined): number | undefined {
  if (profile === "heavy") return 1500;
  if (profile === "light") return 500;
  return undefined; // Use grokXSearch's tier-based default
}

function asConfig(value: Record<string, unknown>): XPostsSourceConfig {
  return {
    vendor: typeof value.vendor === "string" ? value.vendor : "grok",
    accounts: asStringArray(value.accounts),
    keywords: asStringArray(value.keywords),
    queries: asStringArray(value.queries),
    maxResultsPerQuery: asNumber(value.maxResultsPerQuery, 20),
    excludeReplies: asBool(value.excludeReplies, true),
    excludeRetweets: asBool(value.excludeRetweets, true),
    batching: asBatchingConfig(value.batching),
    maxOutputTokensPerAccount:
      typeof value.maxOutputTokensPerAccount === "number" &&
      Number.isFinite(value.maxOutputTokensPerAccount)
        ? value.maxOutputTokensPerAccount
        : undefined,
    promptProfile: asPromptProfile(value.promptProfile),
    fairnessByAccount:
      typeof value.fairnessByAccount === "boolean" ? value.fairnessByAccount : undefined,
  };
}

/** Compile queries for a single account (used when batching is off) */
function compileQueries(config: XPostsSourceConfig): string[] {
  if (config.queries && config.queries.length > 0) return config.queries;

  const out: string[] = [];
  const keywords = (config.keywords ?? []).filter((k) => k.trim().length > 0);
  const kwExpr =
    keywords.length > 0 ? keywords.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(" OR ") : null;

  for (const account of (config.accounts ?? []).filter((a) => a.trim().length > 0)) {
    const filters: string[] = [];
    if (config.excludeReplies) filters.push("-filter:replies");
    if (config.excludeRetweets) filters.push("-filter:retweets");
    const base = `from:${account.trim()}${filters.length > 0 ? ` ${filters.join(" ")}` : ""}`;
    out.push(kwExpr ? `${base} (${kwExpr})` : base);
  }

  if (out.length === 0 && kwExpr) out.push(kwExpr);
  return out;
}

/** Compile a single query for a group of accounts (batched) */
function compileBatchedQuery(
  handles: string[],
  config: XPostsSourceConfig,
): { query: string; handles: string[] } {
  const filters: string[] = [];
  if (config.excludeReplies) filters.push("-filter:replies");
  if (config.excludeRetweets) filters.push("-filter:retweets");

  const keywords = (config.keywords ?? []).filter((k) => k.trim().length > 0);
  const kwExpr =
    keywords.length > 0 ? keywords.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(" OR ") : null;

  const fromExpr = `(${handles.map((h) => `from:${h.trim()}`).join(" OR ")})`;
  const filterExpr = filters.length > 0 ? ` ${filters.join(" ")}` : "";
  const query = kwExpr ? `${fromExpr}${filterExpr} (${kwExpr})` : `${fromExpr}${filterExpr}`;

  return { query, handles };
}

function dayBucketFromIso(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length >= 10) return value.slice(0, 10);
  return null;
}

function extractHandleFromFromQuery(query: string): string | null {
  const m = query.trim().match(/^from:([A-Za-z0-9_]{1,30})(?:\s|$)/);
  return m ? m[1] : null;
}

function getResultsCount(assistantJson: Record<string, unknown> | undefined): number | null {
  if (!assistantJson) return null;
  const results = assistantJson.results;
  return Array.isArray(results) ? results.length : null;
}

function extractPostRawItems(params: {
  assistantJson: Record<string, unknown> | undefined;
  vendor: string;
  query: string;
  dayBucket: string;
  windowStart: string;
  windowEnd: string;
}): unknown[] {
  const results = params.assistantJson?.results;
  if (!Array.isArray(results) || results.length === 0) return [];

  const out: unknown[] = [];
  for (const entry of results) {
    const r = asRecord(entry);
    // Extract metrics if present (optional field from new prompt)
    const metrics = r.metrics && typeof r.metrics === "object" ? r.metrics : undefined;
    out.push({
      kind: "x_post_v1",
      vendor: params.vendor,
      query: params.query,
      day_bucket: params.dayBucket,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      // New fields from updated prompt
      id: asString(r.id),
      date: asString(r.date),
      url: asString(r.url),
      text: asString(r.text),
      text_b64: asString(r.text_b64) ?? asString(r.textB64),
      user_handle: asString(r.user_handle),
      user_display_name: asString(r.user_display_name),
      ...(metrics ? { metrics } : {}),
    });
    if (out.length >= 200) break;
  }

  return out;
}

function getCursorString(cursor: Record<string, unknown>, key: string): string | undefined {
  const v = cursor[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function estimateCreditsPerCall(): number {
  const raw = process.env.X_POSTS_CREDITS_PER_CALL ?? process.env.SIGNAL_CREDITS_PER_CALL;
  if (!raw) return 50;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 50;
}

/** A query job: query string + handles in the batch + groupSize */
interface QueryJob {
  query: string;
  handles: string[];
  groupSize: number;
}

/** Build query jobs based on batching config */
function buildQueryJobs(config: XPostsSourceConfig): QueryJob[] {
  // If raw queries are provided, use them (no batching)
  if (config.queries && config.queries.length > 0) {
    return config.queries.map((q) => ({ query: q, handles: [], groupSize: 1 }));
  }

  // Check for batching
  if (config.batching?.mode === "manual" && config.batching.groups) {
    return config.batching.groups.flatMap((group) =>
      chunkGroup(group, 10).map((g) => {
        const { query, handles } = compileBatchedQuery(g, config);
        return { query, handles, groupSize: handles.length };
      }),
    );
  }

  if (config.batching?.mode === "auto") {
    const batchSize = clampInt(config.batching.batchSize ?? 5, 1, 10);
    // Auto batching is account-driven. If there are no accounts configured,
    // fall back to a normal (non-batched) query compilation (e.g., keywords-only).
    const accounts = (config.accounts ?? []).map((a) => a.trim()).filter((a) => a.length > 0);
    if (accounts.length === 0) {
      const queries = compileQueries(config);
      return queries.map((q) => {
        const handle = extractHandleFromFromQuery(q);
        return { query: q, handles: handle ? [handle] : [], groupSize: 1 };
      });
    }
    const baseGroups =
      config.batching.groups && config.batching.groups.length > 0
        ? config.batching.groups
        : buildAutoGroups(accounts, batchSize);
    return baseGroups.flatMap((group) =>
      chunkGroup(group, 10).map((g) => {
        const { query, handles } = compileBatchedQuery(g, config);
        return { query, handles, groupSize: handles.length };
      }),
    );
  }

  // Default: per-account queries (groupSize=1)
  const queries = compileQueries(config);
  return queries.map((q) => {
    const handle = extractHandleFromFromQuery(q);
    return { query: q, handles: handle ? [handle] : [], groupSize: 1 };
  });
}

export async function fetchXPosts(params: FetchParams): Promise<FetchResult> {
  resetRunBudgetIfNeeded(params);
  const maxSearchCallsPerRun = getMaxSearchCallsPerRun();

  const config = asConfig(params.config);
  const jobs = buildQueryJobs(config);
  if (jobs.length === 0) return { rawItems: [], nextCursor: { ...params.cursor } };

  const sinceId =
    getCursorString(params.cursor, "since_id") ?? getCursorString(params.cursor, "sinceId");
  const sinceTime =
    getCursorString(params.cursor, "since_time") ?? getCursorString(params.cursor, "sinceTime");

  // Note: cadence gating is now handled at the pipeline level (ADR 0009).
  // This connector does not enforce its own daily guardrail.

  const todayBucket = dayBucketFromIso(params.windowEnd);
  const fromDate = sinceTime ?? params.windowStart;
  const toDate = params.windowEnd;
  const dayBucket = (todayBucket ?? params.windowEnd.slice(0, 10)) || params.windowEnd.slice(0, 10);

  const perAccountLimit = config.maxResultsPerQuery ?? 20;
  const batchMode = config.batching?.mode ?? "off";

  const rawItems: unknown[] = [];
  const providerCalls: ProviderCallDraft[] = [];
  let anySuccess = false;
  let jobsExecuted = 0;

  for (const job of jobs) {
    if (maxSearchCallsPerRun !== null && runSearchCallsUsed >= maxSearchCallsPerRun) {
      // Log warning if we're truncating due to limit
      const skipped = jobs.length - jobsExecuted;
      if (skipped > 0) {
        console.warn(
          `[x_posts_fetch] Skipping ${skipped} of ${jobs.length} query jobs due to X_POSTS_MAX_SEARCH_CALLS_PER_RUN=${maxSearchCallsPerRun}`,
        );
      }
      break;
    }
    jobsExecuted++;
    const startedAt = new Date().toISOString();

    // Calculate limit: perAccountLimit * groupSize, capped at maxItems.
    // Note: We do not enforce a fixed per-call cap here; cost is controlled by maxResultsPerQuery,
    // batch sizing, and token budgets.
    const scaledLimit = Math.min(perAccountLimit * job.groupSize, params.limits.maxItems);
    const limit = Math.max(1, scaledLimit);

    // Calculate max output tokens: maxOutputTokensPerAccount * groupSize if set
    const maxOutputTokens =
      config.maxOutputTokensPerAccount && job.groupSize > 0
        ? config.maxOutputTokensPerAccount * job.groupSize
        : undefined;

    // Calculate max text chars based on promptProfile
    const maxTextChars = getMaxTextCharsFromProfile(config.promptProfile);

    try {
      runSearchCallsUsed += 1;
      const result = await grokXSearch({
        query: job.query,
        limit,
        sinceId,
        sinceTime,
        allowedXHandles: job.handles.length > 0 ? job.handles : undefined,
        fromDate,
        toDate,
        maxOutputTokens,
        maxTextChars,
      });

      const endedAt = new Date().toISOString();
      const resultsCount = getResultsCount(result.assistantJson);
      const toolErrorCode = result.structuredError?.code ?? null;

      // Calculate full USD cost: token cost + x_search tool invocation cost
      const inputTokens = result.inputTokens ?? 0;
      const outputTokens = result.outputTokens ?? 0;
      const tokenCostUsd = calculateCostUsd("xai", result.model, inputTokens, outputTokens);
      const xSearchToolCostUsd = getXaiXSearchCostPerCall();
      const costEstimateUsd = tokenCostUsd + xSearchToolCostUsd;

      const parseMeta =
        result.assistantParseError === true
          ? {
              assistant_text_head: result.assistantTextHead,
              assistant_text_tail: result.assistantTextTail,
              assistant_text_length: result.assistantTextLength,
            }
          : {};

      providerCalls.push({
        userId: params.userId,
        purpose: "x_posts_fetch",
        provider: "xai",
        model: result.model,
        inputTokens,
        outputTokens,
        costEstimateCredits: estimateCreditsPerCall(),
        costEstimateUsd,
        meta: {
          sourceId: params.sourceId,
          query: job.query,
          limit,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint: result.endpoint,
          vendor: config.vendor,
          results_count: resultsCount,
          tool_error_code: toolErrorCode,
          assistant_parse_error: result.assistantParseError ?? false,
          ...parseMeta,
          maxSearchCallsPerRun,
          // Batching experiment metadata
          batch_mode: batchMode,
          batch_size: job.groupSize,
          batch_handles_count: job.handles.length,
          max_output_tokens: maxOutputTokens,
        },
        startedAt,
        endedAt,
        status: "ok",
      });

      anySuccess = true;

      if (resultsCount && resultsCount > 0) {
        rawItems.push(
          ...extractPostRawItems({
            assistantJson: result.assistantJson,
            vendor: config.vendor,
            query: job.query,
            dayBucket,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
          }),
        );
      }
    } catch (err) {
      const endedAt = new Date().toISOString();
      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
      const statusCode = typeof errObj.statusCode === "number" ? errObj.statusCode : undefined;
      const endpoint = typeof errObj.endpoint === "string" ? errObj.endpoint : undefined;
      const providerModel = typeof errObj.model === "string" ? errObj.model : undefined;
      const requestId = typeof errObj.requestId === "string" ? errObj.requestId : undefined;
      const responseSnippet =
        typeof errObj.responseSnippet === "string" ? errObj.responseSnippet : undefined;

      // For errors, we may still be charged for the x_search tool invocation
      const errorCostEstimateUsd = getXaiXSearchCostPerCall();

      providerCalls.push({
        userId: params.userId,
        purpose: "x_posts_fetch",
        provider: "xai",
        model: providerModel ?? "unknown",
        inputTokens: 0,
        outputTokens: 0,
        costEstimateCredits: estimateCreditsPerCall(),
        costEstimateUsd: errorCostEstimateUsd,
        meta: {
          sourceId: params.sourceId,
          query: job.query,
          limit,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint,
          vendor: config.vendor,
          requestId,
          maxSearchCallsPerRun,
          // Batching experiment metadata
          batch_mode: batchMode,
          batch_size: job.groupSize,
          batch_handles_count: job.handles.length,
          max_output_tokens: maxOutputTokens,
        },
        startedAt,
        endedAt,
        status: "error",
        error: {
          message: err instanceof Error ? err.message : String(err),
          statusCode,
          responseSnippet,
        },
      });
      // Auth/permission errors are almost certainly global.
      if (statusCode === 401 || statusCode === 403 || statusCode === 422) break;
    }
  }

  // Cursor: only advance if at least one provider call succeeded.
  const nextCursor = anySuccess
    ? { ...params.cursor, since_time: params.windowEnd }
    : { ...params.cursor };

  return {
    rawItems,
    nextCursor,
    meta: {
      providerCalls,
      anySuccess,
      queryCount: jobs.length,
      queriesExecuted: jobsExecuted,
      queriesSkipped: jobs.length - jobsExecuted,
      maxSearchCallsPerRun,
      vendor: config.vendor,
    },
  };
}
