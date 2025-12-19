import type { BudgetTier } from "@aharadar/shared";

import type { LlmRouter, ModelRef } from "./types";

const PROMPT_ID = "triage_v1";
const SCHEMA_VERSION = "triage_v1";

export interface TriageCandidateInput {
  id: string;
  title: string | null;
  bodyText: string | null;
  sourceType: string;
  sourceName?: string | null;
  primaryUrl?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  windowStart: string;
  windowEnd: string;
}

export interface TriageOutput {
  schema_version: "triage_v1";
  prompt_id: "triage_v1";
  provider: string;
  model: string;
  aha_score: number;
  reason: string;
  is_relevant: boolean;
  is_novel: boolean;
  categories: string[];
  should_deep_summarize: boolean;
}

export interface TriageCallResult {
  output: TriageOutput;
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

function parseReasoningEffort(value: string | undefined): "low" | "medium" | "high" | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return null;
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    "You are a strict JSON generator for content triage.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown):\n" +
    '{\n' +
    '  "schema_version": "triage_v1",\n' +
    '  "prompt_id": "triage_v1",\n' +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "aha_score": 0,\n' +
    '  "reason": "Short explanation of why this is (or is not) high-signal.",\n' +
    '  "is_relevant": true,\n' +
    '  "is_novel": true,\n' +
    '  "categories": ["topic1", "topic2"],\n' +
    '  "should_deep_summarize": false\n' +
    "}\n" +
    "Aha score range: 0-100 (0=low-signal noise, 100=rare high-signal). " +
    "Keep reason concise and topic-agnostic. Categories should be short, generic labels."
  );
}

function buildUserPrompt(candidate: TriageCandidateInput, tier: BudgetTier): string {
  const maxBody = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_INPUT_CHARS) ?? 4000;
  const maxTitle = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_TITLE_CHARS) ?? 240;

  const payload = {
    budget_tier: tier,
    window_start: candidate.windowStart,
    window_end: candidate.windowEnd,
    candidate: {
      id: candidate.id,
      source_type: candidate.sourceType,
      source_name: candidate.sourceName ?? null,
      title: clampText(candidate.title, maxTitle),
      body_text: clampText(candidate.bodyText, maxBody),
      primary_url: candidate.primaryUrl ?? null,
      author: candidate.author ?? null,
      published_at: candidate.publishedAt ?? null,
    },
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out;
}

function normalizeTriageOutput(value: Record<string, unknown>, ref: ModelRef): TriageOutput | null {
  const ahaScore = asNumber(value.aha_score);
  if (ahaScore === null || ahaScore < 0 || ahaScore > 100) return null;

  const reason = asString(value.reason);
  if (!reason) return null;

  const isRelevant = asBoolean(value.is_relevant);
  const isNovel = asBoolean(value.is_novel);
  const shouldDeepSummarize = asBoolean(value.should_deep_summarize);
  if (isRelevant === null || isNovel === null || shouldDeepSummarize === null) return null;

  const schemaVersion = asString(value.schema_version) ?? SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? PROMPT_ID;
  if (schemaVersion !== SCHEMA_VERSION || promptId !== PROMPT_ID) return null;

  const provider = ref.provider;
  const model = ref.model;

  return {
    schema_version: SCHEMA_VERSION,
    prompt_id: PROMPT_ID,
    provider,
    model,
    aha_score: ahaScore,
    reason,
    is_relevant: isRelevant,
    is_novel: isNovel,
    categories: normalizeCategories(value.categories),
    should_deep_summarize: shouldDeepSummarize,
  };
}

function estimateCredits(params: { inputTokens: number; outputTokens: number }): number {
  const rateIn =
    parseFloatEnv(process.env.OPENAI_TRIAGE_CREDITS_PER_1K_INPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;
  const rateOut =
    parseFloatEnv(process.env.OPENAI_TRIAGE_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    0;

  const inCredits = (params.inputTokens / 1000) * rateIn;
  const outCredits = (params.outputTokens / 1000) * rateOut;
  return Number.isFinite(inCredits + outCredits) ? inCredits + outCredits : 0;
}

async function runTriageOnce(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidate: TriageCandidateInput;
  isRetry: boolean;
}): Promise<{ output: TriageOutput; inputTokens: number; outputTokens: number; endpoint: string }> {
  const ref = params.router.chooseModel("triage", params.tier);
  const reasoningEffort = parseReasoningEffort(process.env.OPENAI_TRIAGE_REASONING_EFFORT);
  const maxOutputTokens = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_OUTPUT_TOKENS) ?? 250;

  const call = await params.router.call("triage", ref, {
    system: buildSystemPrompt(ref, params.isRetry),
    user: buildUserPrompt(params.candidate, params.tier),
    maxOutputTokens,
    reasoningEffort: reasoningEffort ?? undefined,
  });

  const parsed = tryParseJsonObject(call.outputText);
  if (!parsed) {
    throw new Error("Triage output is not valid JSON");
  }

  const normalized = normalizeTriageOutput(parsed, ref);
  if (!normalized) {
    throw new Error("Triage output failed schema validation");
  }

  return {
    output: normalized,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    endpoint: call.endpoint,
  };
}

export async function triageCandidate(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidate: TriageCandidateInput;
}): Promise<TriageCallResult> {
  try {
    const result = await runTriageOnce({ ...params, isRetry: false });
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
    const retry = await runTriageOnce({ ...params, isRetry: true });
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
