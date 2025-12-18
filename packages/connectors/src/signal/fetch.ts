import type { FetchParams, FetchResult, ProviderCallDraft } from "@aharadar/shared";

import type { SignalSourceConfig } from "./config";
import { grokXSearch } from "./provider";

let lastRunKey: string | null = null;
let runSearchCallsUsed = 0;

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRunKey(params: FetchParams): string {
  // windowEnd comes from the pipeline run and is stable across all source fetches in the same run.
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
  return parseIntEnv(process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN);
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

function asConfig(value: Record<string, unknown>): SignalSourceConfig {
  return {
    provider: typeof value.provider === "string" ? value.provider : "x_search",
    vendor: typeof value.vendor === "string" ? value.vendor : "grok",
    accounts: asStringArray(value.accounts),
    keywords: asStringArray(value.keywords),
    queries: asStringArray(value.queries),
    maxResultsPerQuery: asNumber(value.maxResultsPerQuery, 20),
    extractUrls: asBool(value.extractUrls, true),
    extractEntities: asBool(value.extractEntities, true)
  };
}

function compileQueries(config: SignalSourceConfig): string[] {
  if (config.queries && config.queries.length > 0) return config.queries;

  const out: string[] = [];
  const keywords = (config.keywords ?? []).filter((k) => k.trim().length > 0);
  const kwExpr = keywords.length > 0 ? keywords.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(" OR ") : null;

  for (const account of (config.accounts ?? []).filter((a) => a.trim().length > 0)) {
    const prefix = `from:${account.trim()}`;
    out.push(kwExpr ? `${prefix} (${kwExpr})` : prefix);
  }

  if (out.length === 0 && kwExpr) out.push(kwExpr);
  return out;
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

function getCursorString(cursor: Record<string, unknown>, key: string): string | undefined {
  const v = cursor[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function estimateCreditsPerCall(): number {
  const raw = process.env.SIGNAL_CREDITS_PER_CALL;
  if (!raw) return 50;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 50;
}

export async function fetchSignal(params: FetchParams): Promise<FetchResult> {
  resetRunBudgetIfNeeded(params);
  const maxSearchCallsPerRun = getMaxSearchCallsPerRun();

  const config = asConfig(params.config);
  const queries = compileQueries(config);
  if (queries.length === 0) return { rawItems: [], nextCursor: { ...params.cursor } };

  const sinceId = getCursorString(params.cursor, "since_id") ?? getCursorString(params.cursor, "sinceId");
  const sinceTime = getCursorString(params.cursor, "since_time") ?? getCursorString(params.cursor, "sinceTime");
  const fromDate = sinceTime ?? params.windowStart;
  const toDate = params.windowEnd;

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
      // MVP: only grok vendor is implemented. Others can be added behind this switch without refactors.
      const result =
        config.vendor === "grok"
          ? await grokXSearch({
              query,
              limit,
              sinceId,
              sinceTime,
              allowedXHandles: handle ? [handle] : undefined,
              fromDate,
              toDate
            })
          : await grokXSearch({
              query,
              limit,
              sinceId,
              sinceTime,
              allowedXHandles: handle ? [handle] : undefined,
              fromDate,
              toDate
            });

      const endedAt = new Date().toISOString();
      const resultsCount = getResultsCount(result.assistantJson);
      const toolErrorCode = result.structuredError?.code ?? null;

      providerCalls.push({
        userId: params.userId,
        purpose: "signal_search",
        provider: config.provider,
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
          maxTokens: process.env.SIGNAL_GROK_MAX_OUTPUT_TOKENS ?? null,
          maxSearchCallsPerRun
        },
        startedAt,
        endedAt,
        status: "ok"
      });

      // Successful provider call (even if it returns 0 results) should advance cursors.
      anySuccess = true;

      // Don't store empty signal items; they create noisy inbox entries.
      if (resultsCount && resultsCount > 0) {
        rawItems.push({
          kind: "signal_query_response_v1",
          provider: config.provider,
          vendor: config.vendor,
          query,
          limit,
          sinceId: sinceId ?? null,
          sinceTime: sinceTime ?? null,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          response: result.response
        });
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
        purpose: "signal_search",
        provider: config.provider,
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
          maxSearchCallsPerRun
        },
        startedAt,
        endedAt,
        status: "error",
        error: {
          message: err instanceof Error ? err.message : String(err),
          statusCode,
          responseSnippet
        }
      });
      // Auth/permission errors are almost certainly global (bad key / missing access). Don't spam one per query.
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
      provider: config.provider
    }
  };
}


