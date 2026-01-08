import type { Db } from "@aharadar/db";
import {
  createConfiguredLlmRouter,
  deepSummarizeCandidate,
  type DeepSummaryOutput,
  type LlmRuntimeConfig,
  type TriageOutput,
} from "@aharadar/llm";
import { createLogger, type BudgetTier, type ProviderCallDraft } from "@aharadar/shared";

const log = createLogger({ component: "llm_enrich" });

export interface EnrichLimits {
  /**
   * Max deep-summary calls per run.
   *
   * Safety note: default behavior is "disabled unless explicitly configured".
   */
  maxCalls: number;
}

export interface EnrichRunResult {
  attempted: number;
  enriched: number;
  skipped: number;
  errors: number;
  providerCallsOk: number;
  providerCallsError: number;
}

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPrimaryUrl(params: {
  canonicalUrl: string | null;
  metadata: Record<string, unknown>;
}): string | null {
  if (params.canonicalUrl) return params.canonicalUrl;
  const primary = params.metadata.primary_url;
  if (typeof primary === "string" && primary.length > 0) return primary;
  const extracted = params.metadata.extracted_urls;
  if (Array.isArray(extracted) && extracted.length > 0) {
    const first = extracted[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  return null;
}

export async function enrichTopCandidates(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  tier: BudgetTier;
  // ranked candidates in priority order
  candidates: Array<{
    candidateId: string;
    kind: "cluster" | "item";
    representativeContentItemId: string;
    sourceId: string;
    sourceType: string;
    sourceName: string | null;
    title: string | null;
    bodyText: string | null;
    canonicalUrl: string | null;
    author: string | null;
    publishedAt: string | null;
    metadata: Record<string, unknown>;
    triage: TriageOutput | null;
  }>;
  limits?: Partial<EnrichLimits>;
  /** Optional runtime LLM configuration (overrides env vars) */
  llmConfig?: LlmRuntimeConfig;
}): Promise<{ summaries: Map<string, DeepSummaryOutput>; result: EnrichRunResult }> {
  const maxCalls =
    params.limits?.maxCalls ?? parseIntEnv(process.env.OPENAI_DEEP_SUMMARY_MAX_CALLS_PER_RUN) ?? 0;
  const limit = Math.max(0, Math.min(500, Math.floor(maxCalls)));

  if (params.tier === "low" || limit <= 0 || params.candidates.length === 0) {
    return {
      summaries: new Map(),
      result: { attempted: 0, enriched: 0, skipped: 0, errors: 0, providerCallsOk: 0, providerCallsError: 0 },
    };
  }

  let router: ReturnType<typeof createConfiguredLlmRouter> | null = null;
  try {
    router = createConfiguredLlmRouter(process.env, params.llmConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message }, "LLM deep summary disabled");
    return {
      summaries: new Map(),
      result: { attempted: 0, enriched: 0, skipped: 0, errors: 0, providerCallsOk: 0, providerCallsError: 0 },
    };
  }
  if (!router) {
    return {
      summaries: new Map(),
      result: { attempted: 0, enriched: 0, skipped: 0, errors: 0, providerCallsOk: 0, providerCallsError: 0 },
    };
  }

  const summaries = new Map<string, DeepSummaryOutput>();

  let attempted = 0;
  let enriched = 0;
  let skipped = 0;
  let errors = 0;
  let providerCallsOk = 0;
  let providerCallsError = 0;

  for (const candidate of params.candidates) {
    if (enriched >= limit) break;
    attempted += 1;

    // Only enrich when triage explicitly opted-in (keeps cost predictable).
    if (!candidate.triage || !candidate.triage.should_deep_summarize) {
      skipped += 1;
      continue;
    }

    const ref = router.chooseModel("deep_summary", params.tier);
    const startedAt = new Date().toISOString();
    try {
      const result = await deepSummarizeCandidate({
        router,
        tier: params.tier,
        candidate: {
          id: candidate.candidateId,
          title: candidate.title,
          bodyText: candidate.bodyText,
          sourceType: candidate.sourceType,
          sourceName: candidate.sourceName,
          primaryUrl: getPrimaryUrl({ canonicalUrl: candidate.canonicalUrl, metadata: candidate.metadata }),
          author: candidate.author,
          publishedAt: candidate.publishedAt,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
        },
      });

      summaries.set(candidate.candidateId, result.output);
      enriched += 1;
      providerCallsOk += 1;

      const endedAt = new Date().toISOString();
      const draft: ProviderCallDraft = {
        userId: params.userId,
        purpose: "deep_summary",
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateCredits: result.costEstimateCredits,
        meta: {
          candidateId: candidate.candidateId,
          kind: candidate.kind,
          representativeContentItemId: candidate.representativeContentItemId,
          sourceId: candidate.sourceId,
          sourceType: candidate.sourceType,
          topicId: params.topicId,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint: result.endpoint,
          promptId: result.output.prompt_id,
          schemaVersion: result.output.schema_version,
        },
        startedAt,
        endedAt,
        status: "ok",
      };
      try {
        await params.db.providerCalls.insert(draft);
      } catch (err) {
        log.warn({ err }, "provider_calls insert failed (deep_summary)");
      }
    } catch (err) {
      providerCallsError += 1;
      errors += 1;

      const endedAt = new Date().toISOString();
      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
      const draft: ProviderCallDraft = {
        userId: params.userId,
        purpose: "deep_summary",
        provider: ref.provider,
        model: ref.model,
        inputTokens: 0,
        outputTokens: 0,
        costEstimateCredits: 0,
        meta: {
          candidateId: candidate.candidateId,
          kind: candidate.kind,
          representativeContentItemId: candidate.representativeContentItemId,
          sourceId: candidate.sourceId,
          sourceType: candidate.sourceType,
          topicId: params.topicId,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint: ref.endpoint,
        },
        startedAt,
        endedAt,
        status: "error",
        error: {
          message: err instanceof Error ? err.message : String(err),
          statusCode: errObj.statusCode,
          responseSnippet: errObj.responseSnippet,
        },
      };
      try {
        await params.db.providerCalls.insert(draft);
      } catch (err) {
        log.warn({ err }, "provider_calls insert failed (deep_summary error)");
      }
      log.warn(
        { candidateId: candidate.candidateId, err: err instanceof Error ? err.message : String(err) },
        "Deep summary failed for candidate"
      );
    }
  }

  return {
    summaries,
    result: { attempted, enriched, skipped, errors, providerCallsOk, providerCallsError },
  };
}
