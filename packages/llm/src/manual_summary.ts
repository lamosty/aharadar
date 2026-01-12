import type { BudgetTier } from "@aharadar/shared";

import type { DeepSummaryOutput } from "./deep_summary";
import type { LlmRouter, ModelRef } from "./types";

const PROMPT_ID = "manual_summary_v1";
const SCHEMA_VERSION = "manual_summary_v1";

export interface ManualSummaryInput {
  pastedText: string;
  metadata: {
    title?: string | null;
    author?: string | null;
    url?: string | null;
    sourceType?: string | null;
  };
}

/** Output schema reuses DeepSummaryOutput structure but with manual_summary_v1 versions */
export interface ManualSummaryOutput {
  schema_version: "manual_summary_v1";
  prompt_id: "manual_summary_v1";
  provider: string;
  model: string;
  one_liner: string;
  bullets: string[];
  why_it_matters: string[];
  risks_or_caveats: string[];
  suggested_followups: string[];
}

export interface ManualSummaryCallResult {
  output: ManualSummaryOutput;
  inputTokens: number;
  outputTokens: number;
  costEstimateCredits: number;
  provider: string;
  model: string;
  endpoint: string;
}

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type ReasoningEffort = "none" | "low" | "medium" | "high";

function parseReasoningEffort(value: string | undefined): ReasoningEffort | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "none" || raw === "low" || raw === "medium" || raw === "high") return raw;
  return null;
}

/**
 * Calculate max output tokens based on reasoning effort.
 * Manual summaries need similar tokens to deep summaries.
 */
function getMaxOutputTokensForReasoning(
  effort: ReasoningEffort | null,
  envOverride: number | null,
): number {
  if (envOverride !== null) return envOverride;

  // Token budgets based on reasoning effort
  const budgets: Record<ReasoningEffort, number> = {
    none: 700,
    low: 1200,
    medium: 2500,
    high: 5000,
  };

  return budgets[effort ?? "none"];
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function clampText(value: string | null | undefined, maxChars: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return truncate(trimmed, maxChars);
}

function buildSystemPrompt(ref: ModelRef, isRetry: boolean): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";
  return (
    "You are a strict JSON generator for content summaries.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown):\n" +
    "{\n" +
    '  "schema_version": "manual_summary_v1",\n' +
    '  "prompt_id": "manual_summary_v1",\n' +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "one_liner": "One sentence summary.",\n' +
    '  "bullets": ["Bullet 1", "Bullet 2"],\n' +
    '  "why_it_matters": ["Reason 1", "Reason 2"],\n' +
    '  "risks_or_caveats": ["Caveat 1"],\n' +
    '  "suggested_followups": ["Followup 1"]\n' +
    "}\n" +
    "Keep it topic-agnostic and avoid domain-specific assumptions. Be concise and factual.\n" +
    "If the content contains comments or discussion threads, surface the most insightful comments in the bullets section."
  );
}

function buildUserPrompt(input: ManualSummaryInput, tier: BudgetTier): string {
  const maxBody = parseIntEnv(process.env.MANUAL_SUMMARY_MAX_INPUT_CHARS) ?? 60000;
  const maxTitle = parseIntEnv(process.env.MANUAL_SUMMARY_MAX_TITLE_CHARS) ?? 240;

  const payload = {
    budget_tier: tier,
    metadata: {
      title: clampText(input.metadata.title, maxTitle),
      author: input.metadata.author ?? null,
      url: input.metadata.url ?? null,
      source_type: input.metadata.sourceType ?? null,
    },
    pasted_content: clampText(input.pastedText, maxBody),
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown, maxLen: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
    if (out.length >= maxLen) break;
  }
  return out;
}

function normalizeManualSummaryOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
): ManualSummaryOutput | null {
  const schemaVersion = asString(value.schema_version) ?? SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? PROMPT_ID;
  if (schemaVersion !== SCHEMA_VERSION || promptId !== PROMPT_ID) return null;

  const oneLiner = asString(value.one_liner);
  if (!oneLiner) return null;

  const bullets = asStringArray(value.bullets, 20);
  const why = asStringArray(value.why_it_matters, 20);
  const risks = asStringArray(value.risks_or_caveats, 20);
  const followups = asStringArray(value.suggested_followups, 20);
  if (!bullets || !why || !risks || !followups) return null;

  return {
    schema_version: SCHEMA_VERSION,
    prompt_id: PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
    one_liner: oneLiner,
    bullets,
    why_it_matters: why,
    risks_or_caveats: risks,
    suggested_followups: followups,
  };
}

function estimateCredits(params: { inputTokens: number; outputTokens: number }): number {
  const rateIn =
    parseFloatEnv(process.env.MANUAL_SUMMARY_CREDITS_PER_1K_INPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;
  const rateOut =
    parseFloatEnv(process.env.MANUAL_SUMMARY_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    0;
  const inCredits = (params.inputTokens / 1000) * rateIn;
  const outCredits = (params.outputTokens / 1000) * rateOut;
  return Number.isFinite(inCredits + outCredits) ? inCredits + outCredits : 0;
}

async function runManualSummaryOnce(params: {
  router: LlmRouter;
  tier: BudgetTier;
  input: ManualSummaryInput;
  isRetry: boolean;
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<{
  output: ManualSummaryOutput;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
}> {
  // Reuse deep_summary model selection for manual summary
  const ref = params.router.chooseModel("deep_summary", params.tier);

  // Determine reasoning effort: override > env > default (none)
  const reasoningEffort =
    params.reasoningEffortOverride !== undefined
      ? params.reasoningEffortOverride
      : parseReasoningEffort(process.env.MANUAL_SUMMARY_REASONING_EFFORT);

  // Calculate max output tokens based on reasoning effort
  const envTokenOverride = parseIntEnv(process.env.MANUAL_SUMMARY_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = getMaxOutputTokensForReasoning(reasoningEffort, envTokenOverride);

  // Pass through "none" explicitly so models that default to reasoning can disable it.
  const effectiveReasoningEffort = reasoningEffort ?? undefined;

  const call = await params.router.call("deep_summary", ref, {
    system: buildSystemPrompt(ref, params.isRetry),
    user: buildUserPrompt(params.input, params.tier),
    maxOutputTokens,
    reasoningEffort: effectiveReasoningEffort,
  });

  const parsed = tryParseJsonObject(call.outputText);
  if (!parsed) throw new Error("Manual summary output is not valid JSON");

  const normalized = normalizeManualSummaryOutput(parsed, ref);
  if (!normalized) throw new Error("Manual summary output failed schema validation");

  return {
    output: normalized,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    endpoint: call.endpoint,
  };
}

export async function manualSummarize(params: {
  router: LlmRouter;
  tier: BudgetTier;
  input: ManualSummaryInput;
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<ManualSummaryCallResult> {
  try {
    const result = await runManualSummaryOnce({
      ...params,
      isRetry: false,
      reasoningEffortOverride: params.reasoningEffortOverride,
    });
    return {
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costEstimateCredits: estimateCredits(result),
      provider: result.output.provider,
      model: result.output.model,
      endpoint: result.endpoint,
    };
  } catch {
    const retry = await runManualSummaryOnce({
      ...params,
      isRetry: true,
      reasoningEffortOverride: params.reasoningEffortOverride,
    });
    return {
      output: retry.output,
      inputTokens: retry.inputTokens,
      outputTokens: retry.outputTokens,
      costEstimateCredits: estimateCredits(retry),
      provider: retry.output.provider,
      model: retry.output.model,
      endpoint: retry.endpoint,
    };
  }
}
