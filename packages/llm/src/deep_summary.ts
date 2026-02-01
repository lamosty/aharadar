import type { BudgetTier } from "@aharadar/shared";

import type { LlmRouter, ModelRef } from "./types";

const PROMPT_ID = "deep_summary_v2";
const SCHEMA_VERSION = "deep_summary_v2";

/** A dynamic section with a title and list of items */
export interface SummarySection {
  title: string;
  items: string[];
}

export interface DeepSummaryCandidateInput {
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

export interface DeepSummaryOutput {
  schema_version: "deep_summary_v2";
  prompt_id: "deep_summary_v2";
  provider: string;
  model: string;
  one_liner: string;
  bullets: string[];
  discussion_highlights?: string[];
  /** Dynamic sections shaped by AI guidance (e.g., Bull Case / Bear Case) */
  sections: SummarySection[];
}

export interface DeepSummaryCallResult {
  output: DeepSummaryOutput;
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
 * Deep summaries need more base tokens than triage.
 */
function getMaxOutputTokensForReasoning(
  effort: ReasoningEffort | null,
  envOverride: number | null,
): number {
  if (envOverride !== null) return envOverride;

  // Token budgets based on reasoning effort (higher base for deep summary)
  const budgets: Record<ReasoningEffort, number> = {
    none: 700, // No reasoning overhead
    low: 1200, // Light reasoning
    medium: 2500, // Standard reasoning
    high: 5000, // Deep reasoning
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

function buildSystemPrompt(ref: ModelRef, isRetry: boolean, aiGuidance?: string): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";

  // Default sections when no guidance is provided
  const defaultSectionsNote =
    'If no specific guidance is given, use these default sections: "Why It Matters", "Risks & Caveats", "Suggested Follow-ups".';

  // Guidance section with instructions on how to use it
  const guidanceSection = aiGuidance
    ? `\nTopic-Specific Guidance (use this to shape your "sections" output):\n${aiGuidance}\n\n` +
      "Create section titles that match this guidance. For example, if guidance mentions bull/bear case analysis, " +
      'use sections like "Bull Case" and "Bear Case" instead of generic ones.\n'
    : `\n${defaultSectionsNote}\n`;

  return (
    "You are a strict JSON generator for deep summaries.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown):\n" +
    "{\n" +
    '  "schema_version": "deep_summary_v2",\n' +
    '  "prompt_id": "deep_summary_v2",\n' +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "one_liner": "One sentence summary.",\n' +
    '  "bullets": ["Key point 1", "Key point 2"],\n' +
    '  "discussion_highlights": ["Notable comment 1", "Notable comment 2"],\n' +
    '  "sections": [\n' +
    '    { "title": "Section Title", "items": ["Point 1", "Point 2"] }\n' +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- one_liner: A single sentence capturing the essence.\n" +
    "- bullets: 2-5 key factual points from the content.\n" +
    "- discussion_highlights: Only include if source has comments/discussion. Extract notable viewpoints.\n" +
    "- sections: 2-4 analysis sections. Section titles should reflect the guidance provided.\n" +
    guidanceSection +
    "Be concise and factual."
  );
}

function buildUserPrompt(candidate: DeepSummaryCandidateInput, tier: BudgetTier): string {
  const maxBody = parseIntEnv(process.env.OPENAI_DEEP_SUMMARY_MAX_INPUT_CHARS) ?? 8000;
  const maxTitle = parseIntEnv(process.env.OPENAI_DEEP_SUMMARY_MAX_TITLE_CHARS) ?? 240;

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

function asSections(value: unknown, maxSections: number): SummarySection[] | null {
  if (!Array.isArray(value)) return null;
  const out: SummarySection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const title = asString(obj.title);
    const items = asStringArray(obj.items, 10);
    if (!title || !items || items.length === 0) continue;
    out.push({ title, items });
    if (out.length >= maxSections) break;
  }
  return out.length > 0 ? out : null;
}

function normalizeDeepSummaryOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
): DeepSummaryOutput | null {
  const schemaVersion = asString(value.schema_version) ?? SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? PROMPT_ID;

  // Accept both v1 and v2 schema versions for backwards compatibility
  const isV1 = schemaVersion === "deep_summary_v1" && promptId === "deep_summary_v1";
  const isV2 = schemaVersion === SCHEMA_VERSION && promptId === PROMPT_ID;
  if (!isV1 && !isV2) return null;

  const oneLiner = asString(value.one_liner);
  if (!oneLiner) return null;

  const bullets = asStringArray(value.bullets, 20);
  if (!bullets) return null;

  // Optional discussion_highlights
  const discussionHighlights = asStringArray(value.discussion_highlights, 20) ?? undefined;

  // For v2: parse sections directly
  // For v1: convert old fields to sections format
  let sections: SummarySection[];
  if (isV2) {
    const parsedSections = asSections(value.sections, 6);
    if (!parsedSections) return null;
    sections = parsedSections;
  } else {
    // Convert v1 format to v2 sections
    const why = asStringArray(value.why_it_matters, 20);
    const risks = asStringArray(value.risks_or_caveats, 20);
    const followups = asStringArray(value.suggested_followups, 20);
    sections = [];
    if (why && why.length > 0) {
      sections.push({ title: "Why It Matters", items: why });
    }
    if (risks && risks.length > 0) {
      sections.push({ title: "Risks & Caveats", items: risks });
    }
    if (followups && followups.length > 0) {
      sections.push({ title: "Suggested Follow-ups", items: followups });
    }
    if (sections.length === 0) return null;
  }

  return {
    schema_version: SCHEMA_VERSION,
    prompt_id: PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
    one_liner: oneLiner,
    bullets,
    discussion_highlights: discussionHighlights,
    sections,
  };
}

function estimateCredits(params: { inputTokens: number; outputTokens: number }): number {
  const rateIn =
    parseFloatEnv(process.env.OPENAI_DEEP_SUMMARY_CREDITS_PER_1K_INPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;
  const rateOut =
    parseFloatEnv(process.env.OPENAI_DEEP_SUMMARY_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    0;
  const inCredits = (params.inputTokens / 1000) * rateIn;
  const outCredits = (params.outputTokens / 1000) * rateOut;
  return Number.isFinite(inCredits + outCredits) ? inCredits + outCredits : 0;
}

async function runDeepSummaryOnce(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidate: DeepSummaryCandidateInput;
  isRetry: boolean;
  reasoningEffortOverride?: ReasoningEffort | null;
  aiGuidance?: string;
}): Promise<{
  output: DeepSummaryOutput;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
}> {
  const ref = params.router.chooseModel("deep_summary", params.tier);

  // Determine reasoning effort: override > env > default (none)
  const reasoningEffort =
    params.reasoningEffortOverride !== undefined
      ? params.reasoningEffortOverride
      : parseReasoningEffort(process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT);

  // Calculate max output tokens based on reasoning effort
  const envTokenOverride = parseIntEnv(process.env.OPENAI_DEEP_SUMMARY_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = getMaxOutputTokensForReasoning(reasoningEffort, envTokenOverride);

  // Pass through "none" explicitly so models that default to reasoning can disable it.
  const effectiveReasoningEffort = reasoningEffort ?? undefined;

  const call = await params.router.call("deep_summary", ref, {
    system: buildSystemPrompt(ref, params.isRetry, params.aiGuidance),
    user: buildUserPrompt(params.candidate, params.tier),
    maxOutputTokens,
    reasoningEffort: effectiveReasoningEffort,
  });

  const parsed = tryParseJsonObject(call.outputText);
  if (!parsed) throw new Error("Deep summary output is not valid JSON");

  const normalized = normalizeDeepSummaryOutput(parsed, ref);
  if (!normalized) throw new Error("Deep summary output failed schema validation");

  return {
    output: normalized,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    endpoint: call.endpoint,
  };
}

export async function deepSummarizeCandidate(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidate: DeepSummaryCandidateInput;
  reasoningEffortOverride?: ReasoningEffort | null;
  aiGuidance?: string;
}): Promise<DeepSummaryCallResult> {
  try {
    const result = await runDeepSummaryOnce({
      ...params,
      isRetry: false,
      reasoningEffortOverride: params.reasoningEffortOverride,
      aiGuidance: params.aiGuidance,
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
    const retry = await runDeepSummaryOnce({
      ...params,
      isRetry: true,
      reasoningEffortOverride: params.reasoningEffortOverride,
      aiGuidance: params.aiGuidance,
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
