import type { BudgetTier, CatchupPackOutput, CatchupPackTierItem } from "@aharadar/shared";
import { estimateLlmCredits } from "./costs";
import { extractJsonObject } from "./json";
import type { LlmRouter, ModelRef } from "./types";

const SELECT_PROMPT_ID = "catchup_pack_select_v1";
const SELECT_SCHEMA_VERSION = "catchup_pack_select_v1";
const PACK_PROMPT_ID = "catchup_pack_v1";
const PACK_SCHEMA_VERSION = "catchup_pack_v1";

export interface CatchupPackCandidateInput {
  item_id: string;
  title: string | null;
  body_snippet: string | null;
  triage_reason: string | null;
  ai_score: number | null;
  aha_score: number;
  source_type: string;
  author: string | null;
  published_at: string | null;
}

export interface CatchupPackSelectInput {
  time_budget_minutes: number;
  min_select: number;
  max_select: number;
  items: CatchupPackCandidateInput[];
}

export interface CatchupPackSelectOutput {
  schema_version: "catchup_pack_select_v1";
  prompt_id: "catchup_pack_select_v1";
  provider: string;
  model: string;
  selections: CatchupPackTierItem[];
}

export interface CatchupPackSelectCallResult {
  output: CatchupPackSelectOutput;
  inputTokens: number;
  outputTokens: number;
  costEstimateCredits: number;
  provider: string;
  model: string;
  endpoint: string;
}

export interface CatchupPackTierInput {
  time_budget_minutes: number;
  targets: {
    must_read: number;
    worth_scanning: number;
    headlines: number;
  };
  items: Array<
    CatchupPackCandidateInput & {
      why?: string | null;
      theme?: string | null;
    }
  >;
}

export interface CatchupPackTierCallResult {
  output: CatchupPackOutput;
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

function clampText(value: string | null | undefined, maxChars: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

const CATCHUP_PACK_SELECT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "prompt_id", "provider", "model", "selections"],
  properties: {
    schema_version: { type: "string", const: SELECT_SCHEMA_VERSION },
    prompt_id: { type: "string", const: SELECT_PROMPT_ID },
    provider: { type: "string" },
    model: { type: "string" },
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item_id", "why", "theme"],
        properties: {
          item_id: { type: "string" },
          why: { type: "string" },
          theme: { type: "string" },
        },
      },
    },
  },
};

const CATCHUP_PACK_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "prompt_id",
    "provider",
    "model",
    "time_budget_minutes",
    "tiers",
    "themes",
  ],
  properties: {
    schema_version: { type: "string", const: PACK_SCHEMA_VERSION },
    prompt_id: { type: "string", const: PACK_PROMPT_ID },
    provider: { type: "string" },
    model: { type: "string" },
    time_budget_minutes: { type: "number" },
    tiers: {
      type: "object",
      additionalProperties: false,
      required: ["must_read", "worth_scanning", "headlines"],
      properties: {
        must_read: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item_id", "why", "theme"],
            properties: {
              item_id: { type: "string" },
              why: { type: "string" },
              theme: { type: "string" },
            },
          },
        },
        worth_scanning: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item_id", "why", "theme"],
            properties: {
              item_id: { type: "string" },
              why: { type: "string" },
              theme: { type: "string" },
            },
          },
        },
        headlines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item_id", "why", "theme"],
            properties: {
              item_id: { type: "string" },
              why: { type: "string" },
              theme: { type: "string" },
            },
          },
        },
      },
    },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "item_ids"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          item_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    notes: { type: ["string", "null"] },
  },
};

function buildSelectSystemPrompt(ref: ModelRef, isRetry: boolean): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";
  return (
    "You are a strict JSON generator for listwise catch-up pack selection.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown, no code fences):\n" +
    "{\n" +
    `  "schema_version": "${SELECT_SCHEMA_VERSION}",\n` +
    `  "prompt_id": "${SELECT_PROMPT_ID}",\n` +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "selections": [\n' +
    '    { "item_id": "id", "why": "short reason", "theme": "short theme" }\n' +
    "  ]\n" +
    "}\n" +
    "Select the most valuable items for the time budget, balancing score, recency, and diversity.\n" +
    "Prefer diverse sources/authors. Keep reasons concise and topic-agnostic.\n" +
    "IMPORTANT: Output raw JSON only. Do NOT wrap in markdown code blocks."
  );
}

function buildSelectUserPrompt(input: CatchupPackSelectInput, tier: BudgetTier): string {
  const maxBodySnippet = parseIntEnv(process.env.OPENAI_CATCHUP_PACK_MAX_SNIPPET_CHARS) ?? 200;
  const maxTitle = parseIntEnv(process.env.OPENAI_CATCHUP_PACK_MAX_TITLE_CHARS) ?? 180;

  const items = input.items.map((item) => ({
    item_id: item.item_id,
    title: clampText(item.title, maxTitle),
    body_snippet: clampText(item.body_snippet, maxBodySnippet),
    triage_reason: item.triage_reason,
    ai_score: item.ai_score,
    aha_score: item.aha_score,
    source_type: item.source_type,
    author: item.author,
    published_at: item.published_at,
  }));

  const payload = {
    budget_tier: tier,
    time_budget_minutes: input.time_budget_minutes,
    min_select: input.min_select,
    max_select: input.max_select,
    item_count: items.length,
    items,
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
}

function buildTierSystemPrompt(ref: ModelRef, isRetry: boolean): string {
  const retryNote = isRetry
    ? "The previous response was invalid. Fix it and return ONLY the JSON object."
    : "Return ONLY the JSON object.";
  return (
    "You are creating a catch-up briefing for a busy person who missed recent updates.\n" +
    `${retryNote}\n` +
    "Output must match this schema (no extra keys, no markdown, no code fences):\n" +
    "{\n" +
    `  "schema_version": "${PACK_SCHEMA_VERSION}",\n` +
    `  "prompt_id": "${PACK_PROMPT_ID}",\n` +
    `  "provider": "${ref.provider}",\n` +
    `  "model": "${ref.model}",\n` +
    '  "time_budget_minutes": 60,\n' +
    '  "tiers": {\n' +
    '    "must_read": [{ "item_id": "id", "why": "short reason", "theme": "short theme" }],\n' +
    '    "worth_scanning": [{ "item_id": "id", "why": "short reason", "theme": "short theme" }],\n' +
    '    "headlines": [{ "item_id": "id", "why": "short reason", "theme": "short theme" }]\n' +
    "  },\n" +
    '  "themes": [{ "title": "Theme Name", "summary": "What happened and why it matters", "item_ids": ["id"] }],\n' +
    '  "notes": "Executive summary of key developments"\n' +
    "}\n\n" +
    "CRITICAL - Write for a normal person, NOT a technical system:\n" +
    "- notes: Write 2-3 sentences summarizing the most important developments. What happened? What should they know? Write like a friend catching them up, not a robot describing categories.\n" +
    "- themes: Group related items by what's happening (e.g. 'Fed Policy Shift', 'Tech Earnings'). Summary should explain the story, not list items.\n" +
    "- why: For each item, explain why it matters to them in plain language.\n\n" +
    "Assign items into tiers: must_read for truly important, worth_scanning for useful context, headlines for awareness.\n" +
    "IMPORTANT: Output raw JSON only. Do NOT wrap in markdown code blocks."
  );
}

function buildTierUserPrompt(input: CatchupPackTierInput, tier: BudgetTier): string {
  const maxBodySnippet = parseIntEnv(process.env.OPENAI_CATCHUP_PACK_MAX_SNIPPET_CHARS) ?? 200;
  const maxTitle = parseIntEnv(process.env.OPENAI_CATCHUP_PACK_MAX_TITLE_CHARS) ?? 180;

  const items = input.items.map((item) => ({
    item_id: item.item_id,
    title: clampText(item.title, maxTitle),
    body_snippet: clampText(item.body_snippet, maxBodySnippet),
    triage_reason: item.triage_reason,
    ai_score: item.ai_score,
    aha_score: item.aha_score,
    source_type: item.source_type,
    author: item.author,
    published_at: item.published_at,
    why: item.why ?? null,
    theme: item.theme ?? null,
  }));

  const payload = {
    budget_tier: tier,
    time_budget_minutes: input.time_budget_minutes,
    targets: input.targets,
    item_count: items.length,
    items,
  };

  return `Input JSON:\n${JSON.stringify(payload)}`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function normalizeSelections(raw: unknown, maxItems: number): CatchupPackTierItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CatchupPackTierItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const itemId = asString(obj.item_id);
    const why = asString(obj.why);
    const theme = asString(obj.theme);
    if (!itemId || !why || !theme) continue;
    out.push({ item_id: itemId, why, theme });
    if (out.length >= maxItems) break;
  }
  return out.length > 0 ? out : null;
}

function normalizeCatchupPackSelectOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
): CatchupPackSelectOutput | null {
  const schemaVersion = asString(value.schema_version) ?? SELECT_SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? SELECT_PROMPT_ID;
  if (schemaVersion !== SELECT_SCHEMA_VERSION || promptId !== SELECT_PROMPT_ID) return null;

  const selections = normalizeSelections(value.selections, 200);
  if (!selections) return null;

  return {
    schema_version: SELECT_SCHEMA_VERSION,
    prompt_id: SELECT_PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
    selections,
  };
}

function normalizeCatchupPackOutput(
  value: Record<string, unknown>,
  ref: ModelRef,
  timeBudgetMinutes: number,
): CatchupPackOutput | null {
  const schemaVersion = asString(value.schema_version) ?? PACK_SCHEMA_VERSION;
  const promptId = asString(value.prompt_id) ?? PACK_PROMPT_ID;
  if (schemaVersion !== PACK_SCHEMA_VERSION || promptId !== PACK_PROMPT_ID) return null;

  const tiersRaw = value.tiers;
  if (!tiersRaw || typeof tiersRaw !== "object") return null;
  const tiers = tiersRaw as Record<string, unknown>;

  const mustRead = normalizeSelections(tiers.must_read, 200);
  const worthScanning = normalizeSelections(tiers.worth_scanning, 200);
  const headlines = normalizeSelections(tiers.headlines, 200);
  if (!mustRead || !worthScanning || !headlines) return null;

  const themesRaw = value.themes;
  if (!Array.isArray(themesRaw)) return null;
  const themes: CatchupPackOutput["themes"] = [];
  for (const entry of themesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const title = asString(obj.title);
    const summary = asString(obj.summary);
    if (!title || !summary) continue;
    const itemIds = Array.isArray(obj.item_ids)
      ? obj.item_ids.filter((id) => typeof id === "string").slice(0, 200)
      : [];
    themes.push({ title, summary, item_ids: itemIds });
    if (themes.length >= 12) break;
  }
  if (themes.length === 0) return null;

  const notes = asString(value.notes);

  return {
    schema_version: PACK_SCHEMA_VERSION,
    prompt_id: PACK_PROMPT_ID,
    provider: ref.provider,
    model: ref.model,
    time_budget_minutes: timeBudgetMinutes,
    tiers: {
      must_read: mustRead,
      worth_scanning: worthScanning,
      headlines,
    },
    themes,
    notes: notes ?? null,
  };
}

export async function catchupPackSelect(params: {
  router: LlmRouter;
  tier: BudgetTier;
  input: CatchupPackSelectInput;
}): Promise<CatchupPackSelectCallResult> {
  const ref = params.router.chooseModel("catchup_pack_select", params.tier);
  const maxOutputTokens =
    parseIntEnv(process.env.OPENAI_CATCHUP_PACK_SELECT_MAX_OUTPUT_TOKENS) ?? 1200;

  const runOnce = async (isRetry: boolean): Promise<CatchupPackSelectCallResult> => {
    const call = await params.router.call("catchup_pack_select", ref, {
      system: buildSelectSystemPrompt(ref, isRetry),
      user: buildSelectUserPrompt(params.input, params.tier),
      maxOutputTokens,
      jsonSchema: CATCHUP_PACK_SELECT_JSON_SCHEMA,
    });

    const parsed = extractJsonObject(call.outputText);
    if (!parsed) {
      throw new Error(
        `Failed to parse catch-up pack select JSON:\n${call.outputText.slice(0, 200)}...`,
      );
    }

    const output = normalizeCatchupPackSelectOutput(parsed, ref);
    if (!output) {
      throw new Error(`Catch-up pack select output failed validation.`);
    }

    return {
      output,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costEstimateCredits: estimateLlmCredits({
        provider: ref.provider,
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
  } catch {
    return await runOnce(true);
  }
}

export async function catchupPackTier(params: {
  router: LlmRouter;
  tier: BudgetTier;
  input: CatchupPackTierInput;
}): Promise<CatchupPackTierCallResult> {
  const ref = params.router.chooseModel("catchup_pack_tier", params.tier);
  const maxOutputTokens =
    parseIntEnv(process.env.OPENAI_CATCHUP_PACK_TIER_MAX_OUTPUT_TOKENS) ?? 1800;

  const runOnce = async (isRetry: boolean): Promise<CatchupPackTierCallResult> => {
    const call = await params.router.call("catchup_pack_tier", ref, {
      system: buildTierSystemPrompt(ref, isRetry),
      user: buildTierUserPrompt(params.input, params.tier),
      maxOutputTokens,
      jsonSchema: CATCHUP_PACK_JSON_SCHEMA,
    });

    const parsed = extractJsonObject(call.outputText);
    if (!parsed) {
      throw new Error(
        `Failed to parse catch-up pack tier JSON:\n${call.outputText.slice(0, 200)}...`,
      );
    }

    const output = normalizeCatchupPackOutput(parsed, ref, params.input.time_budget_minutes);
    if (!output) {
      throw new Error("Catch-up pack tier output failed validation.");
    }

    return {
      output,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costEstimateCredits: estimateLlmCredits({
        provider: ref.provider,
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
  } catch {
    return await runOnce(true);
  }
}
