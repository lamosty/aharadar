import type { BudgetTier } from "@aharadar/shared";

import { extractJsonObject } from "./json";
import type { LlmRouter, ModelRef } from "./types";

const PROMPT_ID = "aggregate_summary_v1";
const SCHEMA_VERSION = "aggregate_summary_v1";

export interface AggregateSummaryItem {
  item_id: string;
  title: string | null;
  body_snippet: string | null;
  triage_reason: string | null;
  ai_score: number | null;
  aha_score: number;
  source_type: string;
  published_at: string | null;
  url: string | null;
  cluster_member_count?: number;
  cluster_members?: Array<{ title: string | null; source_type: string }>;
}

export interface AggregateSummaryInput {
  items: AggregateSummaryItem[];
  scope_type: "digest" | "inbox" | "range" | "custom";
  window_start?: string;
  window_end?: string;
}

export interface SentimentAnalysis {
  label: "positive" | "neutral" | "negative";
  confidence: number;
  rationale: string;
}

export interface ThemeItem {
  title: string;
  summary: string;
  item_ids: string[];
}

export interface NotableItem {
  item_id: string;
  why: string;
}

export interface AggregateSummaryOutput {
  schema_version: "aggregate_summary_v1";
  prompt_id: "aggregate_summary_v1";
  provider: string;
  model: string;
  one_liner: string;
  overview: string;
  sentiment: SentimentAnalysis;
  themes: ThemeItem[];
  notable_items: NotableItem[];
  open_questions: string[];
  suggested_followups: string[];
}

export interface AggregateSummaryCallResult {
  output: AggregateSummaryOutput;
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

function clampText(value: string | null | undefined, maxChars: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function buildSystemPrompt(ref: ModelRef, isRetry: boolean): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";
  return (
    "You are an expert content analyst and JSON generator for aggregate summaries.\n" +
    `${retryNote}\n` +
    "Return ONLY the JSON object (no markdown, no extra keys, no code fences).\n" +
    "Output must match this schema:\n" +
    "{\n" +
    '  "schema_version": "aggregate_summary_v1",\n' +
    '  "prompt_id": "aggregate_summary_v1",\n' +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "one_liner": "Single sentence summary.",\n' +
    '  "overview": "Paragraph overview of key themes.",\n' +
    '  "sentiment": {\n' +
    '    "label": "positive|neutral|negative",\n' +
    '    "confidence": 0.85,\n' +
    '    "rationale": "Why this sentiment"\n' +
    "  },\n" +
    '  "themes": [\n' +
    "    {\n" +
    '      "title": "Theme name",\n' +
    '      "summary": "What this theme is about",\n' +
    '      "item_ids": ["id1", "id2"]\n' +
    "    }\n" +
    "  ],\n" +
    '  "notable_items": [\n' +
    "    {\n" +
    '      "item_id": "id",\n' +
    '      "why": "Why this item is notable"\n' +
    "    }\n" +
    "  ],\n" +
    '  "open_questions": ["Question 1"],\n' +
    '  "suggested_followups": ["Followup 1"]\n' +
    "}\n" +
    "Be topic-agnostic, mention cluster sizes when present, and cite specific item IDs.\n" +
    "IMPORTANT: Output raw JSON only. Do NOT wrap in markdown code blocks."
  );
}

function buildUserPrompt(input: AggregateSummaryInput, tier: BudgetTier): string {
  const maxBodySnippet = parseIntEnv(process.env.OPENAI_AGGREGATE_SUMMARY_MAX_SNIPPET_CHARS) ?? 500;
  const maxTitle = parseIntEnv(process.env.OPENAI_AGGREGATE_SUMMARY_MAX_TITLE_CHARS) ?? 240;

  const items = input.items.map((item) => ({
    item_id: item.item_id,
    source_type: item.source_type,
    title: clampText(item.title, maxTitle),
    body_snippet: clampText(item.body_snippet, maxBodySnippet),
    triage_reason: item.triage_reason,
    ai_score: item.ai_score,
    aha_score: item.aha_score,
    published_at: item.published_at,
    url: item.url,
    cluster_member_count: item.cluster_member_count,
    cluster_members: item.cluster_members,
  }));

  const payload = {
    budget_tier: tier,
    scope_type: input.scope_type,
    window_start: input.window_start,
    window_end: input.window_end,
    item_count: input.items.length,
    items,
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
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

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  return null;
}

function normalizeAggregateSummaryOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
): AggregateSummaryOutput | null {
  const schemaVersion = asString(value.schema_version) ?? SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? PROMPT_ID;
  if (schemaVersion !== SCHEMA_VERSION || promptId !== PROMPT_ID) return null;

  const oneLiner = asString(value.one_liner);
  if (!oneLiner) return null;

  const overview = asString(value.overview);
  if (!overview) return null;

  // Parse sentiment
  const sentimentRaw = value.sentiment;
  if (!sentimentRaw || typeof sentimentRaw !== "object") return null;
  const s = sentimentRaw as Record<string, unknown>;
  const sentimentLabel = asString(s.label);
  if (!sentimentLabel || !["positive", "neutral", "negative"].includes(sentimentLabel)) return null;
  const sentimentConfidence = asNumber(s.confidence);
  if (sentimentConfidence === null || sentimentConfidence < 0 || sentimentConfidence > 1)
    return null;
  const sentimentRationale = asString(s.rationale);
  if (!sentimentRationale) return null;

  const sentiment: SentimentAnalysis = {
    label: sentimentLabel as "positive" | "neutral" | "negative",
    confidence: sentimentConfidence,
    rationale: sentimentRationale,
  };

  // Parse themes
  const themesRaw = value.themes;
  if (!Array.isArray(themesRaw)) return null;
  const themes: ThemeItem[] = [];
  for (const themeRaw of themesRaw) {
    if (!themeRaw || typeof themeRaw !== "object") continue;
    const t = themeRaw as Record<string, unknown>;
    const title = asString(t.title);
    const summary = asString(t.summary);
    const itemIds = asStringArray(t.item_ids, 100);
    if (title && summary && itemIds) {
      themes.push({ title, summary, item_ids: itemIds });
    }
    if (themes.length >= 10) break;
  }
  if (themes.length === 0) return null;

  // Parse notable items
  const notableRaw = value.notable_items;
  if (!Array.isArray(notableRaw)) return null;
  const notableItems: NotableItem[] = [];
  for (const itemRaw of notableRaw) {
    if (!itemRaw || typeof itemRaw !== "object") continue;
    const n = itemRaw as Record<string, unknown>;
    const itemId = asString(n.item_id);
    const why = asString(n.why);
    if (itemId && why) {
      notableItems.push({ item_id: itemId, why });
    }
    if (notableItems.length >= 10) break;
  }
  if (notableItems.length === 0) return null;

  // Parse open questions and followups
  const openQuestions = asStringArray(value.open_questions, 20) ?? [];
  const suggestedFollowups = asStringArray(value.suggested_followups, 20) ?? [];

  return {
    schema_version: SCHEMA_VERSION,
    prompt_id: PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
    one_liner: oneLiner,
    overview,
    sentiment,
    themes,
    notable_items: notableItems,
    open_questions: openQuestions,
    suggested_followups: suggestedFollowups,
  };
}

function estimateCredits(params: { inputTokens: number; outputTokens: number }): number {
  const rateIn =
    parseFloatEnv(process.env.OPENAI_AGGREGATE_SUMMARY_CREDITS_PER_1K_INPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;
  const rateOut =
    parseFloatEnv(process.env.OPENAI_AGGREGATE_SUMMARY_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    0;
  const inCredits = (params.inputTokens / 1000) * rateIn;
  const outCredits = (params.outputTokens / 1000) * rateOut;
  return Number.isFinite(inCredits + outCredits) ? inCredits + outCredits : 0;
}

export async function aggregateSummary(params: {
  router: LlmRouter;
  tier: BudgetTier;
  input: AggregateSummaryInput;
}): Promise<AggregateSummaryCallResult> {
  const ref = params.router.chooseModel("aggregate_summary", params.tier);

  const maxOutputTokens =
    parseIntEnv(process.env.OPENAI_AGGREGATE_SUMMARY_MAX_OUTPUT_TOKENS) ?? 2000;

  const runOnce = async (isRetry: boolean): Promise<AggregateSummaryCallResult> => {
    const call = await params.router.call("aggregate_summary", ref, {
      system: buildSystemPrompt(ref, isRetry),
      user: buildUserPrompt(params.input, params.tier),
      maxOutputTokens,
    });

    const parsed = extractJsonObject(call.outputText);
    if (!parsed) {
      throw new Error(
        `Failed to parse aggregate summary JSON output:\n${call.outputText.slice(0, 200)}...`,
      );
    }

    const output = normalizeAggregateSummaryOutput(parsed, ref);
    if (!output) {
      throw new Error(
        `Aggregate summary output failed validation:\n${JSON.stringify(parsed, null, 2).slice(0, 200)}...`,
      );
    }

    return {
      output,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costEstimateCredits: estimateCredits({
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      }),
      provider: ref.provider,
      model: ref.model,
      endpoint: call.endpoint,
    };
  };

  try {
    return await runOnce(false);
  } catch (err) {
    // Retry once with stricter prompt
    return await runOnce(true);
  }
}
