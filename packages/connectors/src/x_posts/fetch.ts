/**
 * X/Twitter posts fetch implementation (ADR 0010).
 *
 * Uses Grok as the provider to search for X posts.
 * Emits only post-level raw items (no bundles).
 * Cadence gating is handled by the pipeline (ADR 0009), not here.
 */
import type { FetchParams, FetchResult, ProviderCallDraft } from "@aharadar/shared";

import type { XPostsSourceConfig } from "./config";
import { grokXSearch } from "../x_shared/grok_x_search";

let lastRunKey: string | null = null;
let runSearchCallsUsed = 0;

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
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
  return parseIntEnv(process.env.X_POSTS_MAX_SEARCH_CALLS_PER_RUN ?? process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN);
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

function asConfig(value: Record<string, unknown>): XPostsSourceConfig {
  return {
    vendor: typeof value.vendor === "string" ? value.vendor : "grok",
    accounts: asStringArray(value.accounts),
    keywords: asStringArray(value.keywords),
    queries: asStringArray(value.queries),
    maxResultsPerQuery: asNumber(value.maxResultsPerQuery, 20),
    excludeReplies: asBool(value.excludeReplies, true),
    excludeRetweets: asBool(value.excludeRetweets, true),
  };
}

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
    out.push({
      kind: "x_post_v1",
      vendor: params.vendor,
      query: params.query,
      day_bucket: params.dayBucket,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      date: asString(r.date),
      url: asString(r.url),
      text: asString(r.text),
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

export async function fetchXPosts(params: FetchParams): Promise<FetchResult> {
  resetRunBudgetIfNeeded(params);
  const maxSearchCallsPerRun = getMaxSearchCallsPerRun();

  const config = asConfig(params.config);
  const queries = compileQueries(config);
  if (queries.length === 0) return { rawItems: [], nextCursor: { ...params.cursor } };

  const sinceId = getCursorString(params.cursor, "since_id") ?? getCursorString(params.cursor, "sinceId");
  const sinceTime =
    getCursorString(params.cursor, "since_time") ?? getCursorString(params.cursor, "sinceTime");

  // Note: cadence gating is now handled at the pipeline level (ADR 0009).
  // This connector does not enforce its own daily guardrail.

  const todayBucket = dayBucketFromIso(params.windowEnd);
  const fromDate = sinceTime ?? params.windowStart;
  const toDate = params.windowEnd;
  const dayBucket = (todayBucket ?? params.windowEnd.slice(0, 10)) || params.windowEnd.slice(0, 10);

  const perQueryBudget = Math.max(1, Math.floor(params.limits.maxItems / queries.length));
  const limit = Math.max(1, Math.min(config.maxResultsPerQuery ?? 20, perQueryBudget));

  const rawItems: unknown[] = [];
  const providerCalls: ProviderCallDraft[] = [];
  let anySuccess = false;

  for (const query of queries) {
    if (maxSearchCallsPerRun !== null && runSearchCallsUsed >= maxSearchCallsPerRun) break;
    const startedAt = new Date().toISOString();
    try {
      runSearchCallsUsed += 1;
      const handle = extractHandleFromFromQuery(query);
      const result = await grokXSearch({
        query,
        limit,
        sinceId,
        sinceTime,
        allowedXHandles: handle ? [handle] : undefined,
        fromDate,
        toDate,
      });

      const endedAt = new Date().toISOString();
      const resultsCount = getResultsCount(result.assistantJson);
      const toolErrorCode = result.structuredError?.code ?? null;

      providerCalls.push({
        userId: params.userId,
        purpose: "x_posts_fetch",
        provider: "x_posts",
        model: config.vendor,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        costEstimateCredits: estimateCreditsPerCall(),
        meta: {
          sourceId: params.sourceId,
          query,
          limit,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint: result.endpoint,
          provider_model: result.model,
          results_count: resultsCount,
          tool_error_code: toolErrorCode,
          maxSearchCallsPerRun,
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
            query,
            dayBucket,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
          })
        );
      }
    } catch (err) {
      const endedAt = new Date().toISOString();
      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
      const statusCode = typeof errObj.statusCode === "number" ? errObj.statusCode : undefined;
      const endpoint = typeof errObj.endpoint === "string" ? errObj.endpoint : undefined;
      const providerModel = typeof errObj.model === "string" ? errObj.model : undefined;
      const requestId = typeof errObj.requestId === "string" ? errObj.requestId : undefined;
      const responseSnippet = typeof errObj.responseSnippet === "string" ? errObj.responseSnippet : undefined;

      providerCalls.push({
        userId: params.userId,
        purpose: "x_posts_fetch",
        provider: "x_posts",
        model: config.vendor,
        inputTokens: 0,
        outputTokens: 0,
        costEstimateCredits: estimateCreditsPerCall(),
        meta: {
          sourceId: params.sourceId,
          query,
          limit,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint,
          provider_model: providerModel,
          requestId,
          maxSearchCallsPerRun,
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
      continue;
    }
  }

  // Cursor: only advance if at least one provider call succeeded.
  const nextCursor = anySuccess ? { ...params.cursor, since_time: params.windowEnd } : { ...params.cursor };

  return {
    rawItems,
    nextCursor,
    meta: {
      providerCalls,
      anySuccess,
      queryCount: queries.length,
      vendor: config.vendor,
    },
  };
}
