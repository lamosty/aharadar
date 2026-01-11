import type { BudgetTier } from "@aharadar/shared";

import type { LlmRouter, ModelRef } from "./types";

const PROMPT_ID = "triage_v1";
const SCHEMA_VERSION = "triage_v1";

/**
 * JSON Schema for triage output - used for structured output with Claude Agent SDK.
 * This enables the SDK's native JSON mode for reliable parsing.
 */
export const TRIAGE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    schema_version: { type: "string", const: "triage_v1" },
    prompt_id: { type: "string", const: "triage_v1" },
    provider: { type: "string" },
    model: { type: "string" },
    aha_score: { type: "number", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    is_relevant: { type: "boolean" },
    is_novel: { type: "boolean" },
    categories: { type: "array", items: { type: "string" } },
    should_deep_summarize: { type: "boolean" },
  },
  required: [
    "schema_version",
    "prompt_id",
    "provider",
    "model",
    "aha_score",
    "reason",
    "is_relevant",
    "is_novel",
    "categories",
    "should_deep_summarize",
  ],
  additionalProperties: false,
};

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

type ReasoningEffort = "none" | "low" | "medium" | "high";

function parseReasoningEffort(value: string | undefined): ReasoningEffort | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "none" || raw === "low" || raw === "medium" || raw === "high") return raw;
  return null;
}

/**
 * Calculate max output tokens based on reasoning effort.
 * Reasoning models need more tokens to include both reasoning and output.
 */
function getMaxOutputTokensForReasoning(
  effort: ReasoningEffort | null,
  envOverride: number | null,
): number {
  // Explicit env override always wins
  if (envOverride !== null) return envOverride;

  // Token budgets based on reasoning effort
  const budgets: Record<ReasoningEffort, number> = {
    none: 350, // No reasoning overhead
    low: 800, // Light reasoning
    medium: 2000, // Standard reasoning
    high: 4000, // Deep reasoning
  };

  return budgets[effort ?? "none"];
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
    "Output must match this schema (no extra keys, no markdown, no code fences):\n" +
    "{\n" +
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
    "Keep reason concise and topic-agnostic. Categories should be short, generic labels.\n" +
    "IMPORTANT: Output raw JSON only. Do NOT wrap in markdown code blocks."
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

/**
 * Extract JSON object from text that may be wrapped in markdown code fences
 * or prefixed with thinking/explanation text.
 *
 * Handles:
 * - Raw JSON: {"key": "value"}
 * - Markdown wrapped: ```json {"key": "value"} ```
 * - Thinking prefixed: "Let me think... ```json {"key": "value"} ```"
 * - Multiple JSON blocks (takes the last complete one)
 */
function extractJsonFromText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  // Try direct JSON parse first (most common case for OpenAI/Anthropic API)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON, continue to extraction
    }
  }

  // Extract from markdown code blocks (```json ... ``` or ``` ... ```)
  // Use global flag to find all matches, take the last one (most likely to be the final answer)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let lastMatch: string | null = null;

  for (const match of trimmed.matchAll(codeBlockRegex)) {
    const content = match[1].trim();
    if (content.startsWith("{")) {
      lastMatch = content;
    }
  }

  if (lastMatch) {
    try {
      const parsed = JSON.parse(lastMatch);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON in code block
    }
  }

  // Last resort: find any JSON object in the text
  // Look for { ... } pattern that might be valid JSON
  const jsonObjectRegex = /\{[\s\S]*?"aha_score"[\s\S]*?\}/g;
  let lastJsonMatch: string | null = null;

  for (const match of trimmed.matchAll(jsonObjectRegex)) {
    lastJsonMatch = match[0];
  }

  if (lastJsonMatch) {
    try {
      const parsed = JSON.parse(lastJsonMatch);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Still not valid JSON
    }
  }

  return null;
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

  // Allow missing schema_version/prompt_id - we'll fill them in
  const schemaVersion = asString(value.schema_version) ?? SCHEMA_VERSION;
  const _promptId = asString(value.prompt_id) ?? PROMPT_ID;

  // Be lenient on schema validation - as long as we have required fields
  if (schemaVersion !== SCHEMA_VERSION) {
    // Log but don't fail - model might use different casing or format
    console.warn(
      `[triage] Unexpected schema_version: ${schemaVersion}, expected: ${SCHEMA_VERSION}`,
    );
  }

  return {
    schema_version: SCHEMA_VERSION,
    prompt_id: PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
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
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<{ output: TriageOutput; inputTokens: number; outputTokens: number; endpoint: string }> {
  const ref = params.router.chooseModel("triage", params.tier);

  // Determine reasoning effort: override > env > default (none)
  const reasoningEffort =
    params.reasoningEffortOverride !== undefined
      ? params.reasoningEffortOverride
      : parseReasoningEffort(process.env.OPENAI_TRIAGE_REASONING_EFFORT);

  // Calculate max output tokens based on reasoning effort
  const envTokenOverride = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = getMaxOutputTokensForReasoning(reasoningEffort, envTokenOverride);

  // Build JSON schema for the request (provider-specific, but Claude subscription uses it)
  const jsonSchema = { ...TRIAGE_JSON_SCHEMA };
  // Inject provider/model into schema for validation
  if (jsonSchema.properties && typeof jsonSchema.properties === "object") {
    const props = jsonSchema.properties as Record<string, unknown>;
    props.provider = { type: "string", const: ref.provider };
    props.model = { type: "string", const: ref.model };
  }

  // Pass through "none" explicitly so models that default to reasoning can disable it.
  const effectiveReasoningEffort = reasoningEffort ?? undefined;

  const call = await params.router.call("triage", ref, {
    system: buildSystemPrompt(ref, params.isRetry),
    user: buildUserPrompt(params.candidate, params.tier),
    maxOutputTokens,
    reasoningEffort: effectiveReasoningEffort,
    jsonSchema,
  });

  // Try structured output first (from Claude subscription SDK)
  let parsed: Record<string, unknown> | null = null;

  if (call.structuredOutput && typeof call.structuredOutput === "object") {
    parsed = call.structuredOutput as Record<string, unknown>;
  }

  // Fall back to text extraction
  if (!parsed) {
    parsed = extractJsonFromText(call.outputText);
  }

  if (!parsed) {
    // Log the problematic output for debugging
    const preview = call.outputText.substring(0, 200);
    console.error(
      `[triage] Failed to parse JSON from output (${call.outputText.length} chars): ${preview}...`,
    );
    throw new Error("Triage output is not valid JSON");
  }

  const normalized = normalizeTriageOutput(parsed, ref);
  if (!normalized) {
    console.error(
      `[triage] Schema validation failed for parsed JSON: ${JSON.stringify(parsed).substring(0, 200)}`,
    );
    throw new Error("Triage output failed schema validation");
  }

  return {
    output: normalized,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    endpoint: call.endpoint,
  };
}

/** Delay helper for retry backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if error is a quota/limit error that shouldn't be retried */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("quota exceeded") || msg.includes("rate limit") || msg.includes("too many");
}

export async function triageCandidate(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidate: TriageCandidateInput;
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<TriageCallResult> {
  try {
    const result = await runTriageOnce({
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
  } catch (firstError) {
    // Don't retry quota/rate limit errors - they won't resolve immediately
    if (isQuotaError(firstError)) {
      throw firstError;
    }

    // Log first error for debugging
    const errMsg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(`[triage] First attempt failed: ${errMsg}, retrying after backoff...`);

    // Backoff before retry (1-2 seconds with jitter)
    const backoffMs = 1000 + Math.random() * 1000;
    await delay(backoffMs);

    const retry = await runTriageOnce({
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

// ============================================================================
// BATCH TRIAGE PROCESSING
// ============================================================================

const BATCH_SCHEMA_VERSION = "triage_batch_v1";

export const TRIAGE_BATCH_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    schema_version: { type: "string", const: "triage_batch_v1" },
    batch_id: { type: "string" },
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          aha_score: { type: "number", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          is_relevant: { type: "boolean" },
          is_novel: { type: "boolean" },
          categories: { type: "array", items: { type: "string" } },
          should_deep_summarize: { type: "boolean" },
        },
        required: [
          "id",
          "aha_score",
          "reason",
          "is_relevant",
          "is_novel",
          "categories",
          "should_deep_summarize",
        ],
      },
    },
  },
  required: ["schema_version", "batch_id", "results"],
  additionalProperties: false,
};

export interface TriageBatchItem {
  id: string;
  aha_score: number;
  reason: string;
  is_relevant: boolean;
  is_novel: boolean;
  categories: string[];
  should_deep_summarize: boolean;
}

export interface TriageBatchOutput {
  schema_version: "triage_batch_v1";
  batch_id: string;
  results: TriageBatchItem[];
}

export interface TriageBatchCallResult {
  outputs: Map<string, TriageOutput>;
  inputTokens: number;
  outputTokens: number;
  costEstimateCredits: number;
  provider: string;
  model: string;
  endpoint: string;
  itemCount: number;
  successCount: number;
}

function buildBatchSystemPrompt(ref: ModelRef, isRetry: boolean): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";
  return (
    "You are a strict JSON generator for content triage.\n" +
    "You will receive multiple items in a batch. Evaluate EACH item independently.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown, no code fences):\n" +
    "{\n" +
    '  "schema_version": "triage_batch_v1",\n' +
    '  "batch_id": "<same as input batch_id>",\n' +
    '  "results": [\n' +
    "    {\n" +
    '      "id": "<item id from input>",\n' +
    '      "aha_score": 0-100,\n' +
    '      "reason": "Short explanation of signal level",\n' +
    '      "is_relevant": true/false,\n' +
    '      "is_novel": true/false,\n' +
    '      "categories": ["topic1", "topic2"],\n' +
    '      "should_deep_summarize": true/false\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- Return ONE result for EACH input item, in the same order\n" +
    "- Each result.id MUST match an input item id exactly\n" +
    "- aha_score range: 0-100 (0=low-signal noise, 100=rare high-signal)\n" +
    "- Keep reason concise and topic-agnostic\n" +
    "- Categories should be short, generic labels\n" +
    "IMPORTANT: Output raw JSON only. Do NOT wrap in markdown code blocks."
  );
}

function buildBatchUserPrompt(
  candidates: TriageCandidateInput[],
  batchId: string,
  tier: BudgetTier,
): string {
  const maxBody = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_INPUT_CHARS) ?? 4000;
  const maxTitle = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_TITLE_CHARS) ?? 240;

  const items = candidates.map((c) => ({
    id: c.id,
    source_type: c.sourceType,
    source_name: c.sourceName ?? null,
    title: clampText(c.title, maxTitle),
    body_text: clampText(c.bodyText, maxBody),
    primary_url: c.primaryUrl ?? null,
    author: c.author ?? null,
    published_at: c.publishedAt ?? null,
  }));

  const payload = {
    batch_id: batchId,
    budget_tier: tier,
    window_start: candidates[0]?.windowStart ?? "",
    window_end: candidates[0]?.windowEnd ?? "",
    items,
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
}

function normalizeBatchOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
  expectedIds: Set<string>,
): Map<string, TriageOutput> | null {
  const schemaVersion = asString(value.schema_version);
  if (schemaVersion !== BATCH_SCHEMA_VERSION) {
    console.warn(`[triage-batch] Unexpected schema_version: ${schemaVersion}`);
  }

  const results = value.results;
  if (!Array.isArray(results)) {
    console.error("[triage-batch] results is not an array");
    return null;
  }

  const outputMap = new Map<string, TriageOutput>();

  for (const item of results) {
    if (!item || typeof item !== "object") continue;

    const itemObj = item as Record<string, unknown>;
    const id = asString(itemObj.id);
    if (!id) {
      console.warn("[triage-batch] Item missing id, skipping");
      continue;
    }

    if (!expectedIds.has(id)) {
      console.warn(`[triage-batch] Unexpected item id: ${id}`);
      continue;
    }

    const ahaScore = asNumber(itemObj.aha_score);
    if (ahaScore === null || ahaScore < 0 || ahaScore > 100) {
      console.warn(`[triage-batch] Invalid aha_score for ${id}`);
      continue;
    }

    const reason = asString(itemObj.reason);
    if (!reason) {
      console.warn(`[triage-batch] Missing reason for ${id}`);
      continue;
    }

    const isRelevant = asBoolean(itemObj.is_relevant);
    const isNovel = asBoolean(itemObj.is_novel);
    const shouldDeepSummarize = asBoolean(itemObj.should_deep_summarize);

    if (isRelevant === null || isNovel === null || shouldDeepSummarize === null) {
      console.warn(`[triage-batch] Missing boolean fields for ${id}`);
      continue;
    }

    outputMap.set(id, {
      schema_version: SCHEMA_VERSION,
      prompt_id: PROMPT_ID,
      provider: ref.provider,
      model: ref.model,
      aha_score: ahaScore,
      reason,
      is_relevant: isRelevant,
      is_novel: isNovel,
      categories: normalizeCategories(itemObj.categories),
      should_deep_summarize: shouldDeepSummarize,
    });
  }

  return outputMap.size > 0 ? outputMap : null;
}

function extractBatchJsonFromText(text: string): Record<string, unknown> | null {
  // Same pattern as extractJsonFromText but looks for batch structure
  const trimmed = text.trim();

  // Try direct JSON parse first
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "results" in parsed) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Extract from markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let lastMatch: string | null = null;

  for (const match of trimmed.matchAll(codeBlockRegex)) {
    const content = match[1].trim();
    if (content.startsWith("{") && content.includes("results")) {
      lastMatch = content;
    }
  }

  if (lastMatch) {
    try {
      const parsed = JSON.parse(lastMatch);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON
    }
  }

  // Last resort: find batch JSON object
  const jsonObjectRegex = /\{[\s\S]*?"results"[\s\S]*?\]/g;
  for (const match of trimmed.matchAll(jsonObjectRegex)) {
    // Find the complete object by counting braces
    const startIdx = trimmed.indexOf(match[0]);
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < trimmed.length; i++) {
      if (trimmed[i] === "{") depth++;
      else if (trimmed[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (endIdx > startIdx) {
      try {
        const parsed = JSON.parse(trimmed.slice(startIdx, endIdx));
        if (parsed && typeof parsed === "object" && "results" in parsed) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Continue
      }
    }
  }

  return null;
}

async function runBatchTriageOnce(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidates: TriageCandidateInput[];
  batchId: string;
  isRetry: boolean;
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<{
  outputs: Map<string, TriageOutput>;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
}> {
  const ref = params.router.chooseModel("triage", params.tier);

  // Determine reasoning effort: override > env > default (none)
  const reasoningEffort =
    params.reasoningEffortOverride !== undefined
      ? params.reasoningEffortOverride
      : parseReasoningEffort(process.env.OPENAI_TRIAGE_REASONING_EFFORT);

  // Batch needs more output tokens - scale by item count
  const envTokenOverride = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_OUTPUT_TOKENS);
  const baseTokens = getMaxOutputTokensForReasoning(reasoningEffort, envTokenOverride);
  const tokensPerItem = reasoningEffort && reasoningEffort !== "none" ? 250 : 120;
  const maxOutputTokens = Math.max(baseTokens, params.candidates.length * tokensPerItem);

  const expectedIds = new Set(params.candidates.map((c) => c.id));

  // Pass through "none" explicitly so models that default to reasoning can disable it.
  const effectiveReasoningEffort = reasoningEffort ?? undefined;

  const call = await params.router.call("triage", ref, {
    system: buildBatchSystemPrompt(ref, params.isRetry),
    user: buildBatchUserPrompt(params.candidates, params.batchId, params.tier),
    maxOutputTokens,
    reasoningEffort: effectiveReasoningEffort,
    jsonSchema: TRIAGE_BATCH_JSON_SCHEMA,
  });

  // Try structured output first
  let parsed: Record<string, unknown> | null = null;

  if (call.structuredOutput && typeof call.structuredOutput === "object") {
    parsed = call.structuredOutput as Record<string, unknown>;
  }

  // Fall back to text extraction
  if (!parsed) {
    parsed = extractBatchJsonFromText(call.outputText);
  }

  if (!parsed) {
    const preview = call.outputText.substring(0, 300);
    console.error(
      `[triage-batch] Failed to parse batch JSON (${call.outputText.length} chars): ${preview}...`,
    );
    throw new Error("Batch triage output is not valid JSON");
  }

  const outputs = normalizeBatchOutput(parsed, ref, expectedIds);
  if (!outputs) {
    console.error(
      `[triage-batch] Batch normalization failed: ${JSON.stringify(parsed).substring(0, 300)}`,
    );
    throw new Error("Batch triage output failed normalization");
  }

  return {
    outputs,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    endpoint: call.endpoint,
  };
}

/**
 * Triage a batch of candidates in a single LLM call.
 * Returns a map of candidateId -> TriageOutput.
 * If batch fails completely, throws error. Partial results are returned if some items fail normalization.
 */
export async function triageBatch(params: {
  router: LlmRouter;
  tier: BudgetTier;
  candidates: TriageCandidateInput[];
  batchId: string;
  reasoningEffortOverride?: ReasoningEffort | null;
}): Promise<TriageBatchCallResult> {
  if (params.candidates.length === 0) {
    return {
      outputs: new Map(),
      inputTokens: 0,
      outputTokens: 0,
      costEstimateCredits: 0,
      provider: "none",
      model: "none",
      endpoint: "none",
      itemCount: 0,
      successCount: 0,
    };
  }

  const ref = params.router.chooseModel("triage", params.tier);

  try {
    const result = await runBatchTriageOnce({
      ...params,
      isRetry: false,
      reasoningEffortOverride: params.reasoningEffortOverride,
    });
    return {
      outputs: result.outputs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costEstimateCredits: estimateCredits(result),
      provider: ref.provider,
      model: ref.model,
      endpoint: result.endpoint,
      itemCount: params.candidates.length,
      successCount: result.outputs.size,
    };
  } catch (firstError) {
    // Don't retry quota/rate limit errors
    if (isQuotaError(firstError)) {
      throw firstError;
    }

    const errMsg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(`[triage-batch] First attempt failed: ${errMsg}, retrying...`);

    // Backoff before retry
    const backoffMs = 1500 + Math.random() * 1000;
    await delay(backoffMs);

    const retry = await runBatchTriageOnce({
      ...params,
      isRetry: true,
      reasoningEffortOverride: params.reasoningEffortOverride,
    });
    return {
      outputs: retry.outputs,
      inputTokens: retry.inputTokens,
      outputTokens: retry.outputTokens,
      costEstimateCredits: estimateCredits(retry),
      provider: ref.provider,
      model: ref.model,
      endpoint: retry.endpoint,
      itemCount: params.candidates.length,
      successCount: retry.outputs.size,
    };
  }
}
