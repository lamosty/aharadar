import type { FetchParams, FetchResult, ProviderCallDraft } from "@aharadar/shared";

import type { SignalSourceConfig } from "./config";
import { grokXSearch } from "./provider";

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
  const config = asConfig(params.config);
  const queries = compileQueries(config);
  if (queries.length === 0) return { rawItems: [], nextCursor: { ...params.cursor } };

  const sinceId = getCursorString(params.cursor, "since_id") ?? getCursorString(params.cursor, "sinceId");
  const sinceTime = getCursorString(params.cursor, "since_time") ?? getCursorString(params.cursor, "sinceTime");

  const perQueryBudget = Math.max(1, Math.floor(params.limits.maxItems / queries.length));
  const limit = Math.max(1, Math.min(config.maxResultsPerQuery ?? 20, perQueryBudget));

  const rawItems: unknown[] = [];
  const providerCalls: ProviderCallDraft[] = [];
  let anySuccess = false;

  for (const query of queries) {
    const startedAt = new Date().toISOString();
    try {
      // MVP: only grok vendor is implemented. Others can be added behind this switch without refactors.
      const result =
        config.vendor === "grok"
          ? await grokXSearch({ query, limit, sinceId, sinceTime })
          : await grokXSearch({ query, limit, sinceId, sinceTime });

      const endedAt = new Date().toISOString();

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
          endpoint: result.endpoint,
          provider_model: result.model
        },
        startedAt,
        endedAt,
        status: "ok"
      });

      anySuccess = true;
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
          requestId
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
      if (statusCode === 401 || statusCode === 403) break;
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


