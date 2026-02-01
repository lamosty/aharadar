/**
 * Shared Grok x_search provider implementation.
 *
 * Used by both `signal` and `x_posts` connectors.
 * Extracted for reuse without duplication (Task 002).
 */

export interface GrokXSearchParams {
  query: string;
  limit: number;
  sinceId?: string;
  sinceTime?: string;
  /**
   * If provided, enable the x_search tool constrained to these handles.
   * Handles must be without "@".
   */
  allowedXHandles?: string[];
  /** ISO timestamp */
  fromDate?: string;
  /** ISO timestamp */
  toDate?: string;
  /**
   * Override max output tokens for this call.
   * Will be clamped to X_POSTS_MAX_OUTPUT_TOKENS_HARD_CAP if set.
   */
  maxOutputTokens?: number;
  /**
   * Override max text chars per post in the prompt.
   * If not provided, uses tier-based default (480 for normal, 1000 for high).
   */
  maxTextChars?: number;
}

export interface GrokXSearchResult {
  /** Raw provider response (kept opaque; normalization extracts what it can). */
  response: unknown;
  endpoint: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /**
   * Best-effort parse of the assistant's strict-JSON output (Responses or Chat Completions).
   * When present, callers can inspect `results`/`error` without re-parsing.
   */
  assistantJson?: Record<string, unknown>;
  /** True if assistant text existed but JSON parsing failed. */
  assistantParseError?: boolean;
  /** True if emit_results function call was present. */
  emitResultsPresent?: boolean;
  /** True if emit_results arguments failed to parse. */
  emitResultsParseError?: boolean;
  /** emit_results arguments snippets (debug). */
  emitResultsArgsHead?: string;
  emitResultsArgsTail?: string;
  emitResultsArgsLength?: number;
  /** Debug snippets when parse fails. */
  assistantTextHead?: string;
  assistantTextTail?: string;
  assistantTextLength?: number;
  structuredError?: { code: string; message: string | null };
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function requireAnyEnv(names: string[]): string {
  const value = firstEnv(names);
  if (value) return value;
  throw new Error(`Missing required env var for Grok x_search: one of ${names.join(", ")}`);
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function extractErrorDetail(response: unknown): string | null {
  if (typeof response === "string") return response;
  const obj = asRecord(response);
  const err = obj.error;
  if (err && typeof err === "object" && !Array.isArray(err)) {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.detail === "string") return obj.detail;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

function collectAssistantTextFromOutput(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output) {
    const it = asRecord(item);
    if (it.type === "message" && it.role === "assistant") {
      const content = it.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const p = asRecord(part);
          if (p.type === "output_text" || p.type === "text") {
            const text = p.text;
            if (typeof text === "string" && text.length > 0) {
              parts.push(text);
            }
          }
        }
      } else if (typeof content === "string" && content.length > 0) {
        parts.push(content);
      }
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function extractAssistantContent(response: unknown): string | null {
  const rec = asRecord(response);

  // Responses API: output[] may contain an assistant message with output_text parts.
  const output = rec.output;
  const combined = collectAssistantTextFromOutput(output);
  if (combined && combined.length > 0) return combined;

  // OpenAI-compatible Responses API: output_text is a convenience field.
  const outputText = rec.output_text;
  if (typeof outputText === "string" && outputText.length > 0) return outputText;

  // OpenAI-compatible Chat Completions API.
  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = asRecord(choices[0]);
    const msg = asRecord(first.message);
    const content = msg.content;
    if (typeof content === "string" && content.length > 0) return content;
  }

  return null;
}

function extractFunctionCallArguments(response: unknown, name: string): string | null {
  const rec = asRecord(response);
  const output = rec.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (it.type !== "function_call") continue;
    if (it.name !== name) continue;
    const args = it.arguments;
    if (typeof args === "string" && args.length > 0) return args;
    if (args && typeof args === "object" && !Array.isArray(args)) {
      return JSON.stringify(args);
    }
    return null;
  }
  return null;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return { results: parsed };
    }
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function stripMarkdownFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? (match[1]?.trim() ?? "") : text;
}

function extractBracketedChunk(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseAssistantJsonFromText(text: string): Record<string, unknown> | null {
  const stripped = stripMarkdownFence(text)
    .replace(/^\uFEFF/, "")
    .trim();
  const direct = tryParseJsonObject(stripped);
  if (direct) return direct;

  const arrayChunk = extractBracketedChunk(stripped, "[", "]");
  if (arrayChunk) {
    const parsed = tryParseJsonObject(arrayChunk);
    if (parsed) return parsed;
  }

  const objectChunk = extractBracketedChunk(stripped, "{", "}");
  if (objectChunk) {
    const parsed = tryParseJsonObject(objectChunk);
    if (parsed) return parsed;
  }

  return null;
}

function extractStructuredErrorCodeFromText(
  text: string,
): { code: string; message: string | null } | null {
  const obj = parseAssistantJsonFromText(text);
  if (!obj) return null;
  const err = obj.error;
  if (!err || typeof err !== "object" || Array.isArray(err)) return null;
  const code = (err as Record<string, unknown>).code;
  const message = (err as Record<string, unknown>).message;
  if (typeof code !== "string" || code.length === 0) return null;
  return { code, message: typeof message === "string" && message.length > 0 ? message : null };
}

function buildAssistantTextSnippets(text: string): {
  head: string;
  tail: string;
  length: number;
} {
  const trimmed = text.trim();
  const length = trimmed.length;
  const max = 240;
  const head = trimmed.slice(0, max);
  const tail = length > max ? trimmed.slice(-max) : trimmed;
  return { head, tail, length };
}

function responseSnippet(response: unknown): string | null {
  if (typeof response === "string") return truncateString(response, 800);
  try {
    const json = JSON.stringify(response);
    return truncateString(json, 800);
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractUsageTokens(
  response: unknown,
): { inputTokens: number; outputTokens: number } | null {
  const obj = asRecord(response);
  const usage = obj.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const u = usage as Record<string, unknown>;

  const prompt = asNumber(u.prompt_tokens) ?? asNumber(u.input_tokens);
  const completion = asNumber(u.completion_tokens) ?? asNumber(u.output_tokens);
  if (prompt === null || completion === null) return null;
  return { inputTokens: prompt, outputTokens: completion };
}

function parseIntEnv(name: string, value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDefaultTier(): "low" | "normal" | "high" {
  const raw = (process.env.DEFAULT_TIER ?? "normal").toLowerCase();
  if (raw === "low" || raw === "normal" || raw === "high") return raw;
  return "normal";
}

function withV1(baseUrl: string, pathAfterV1: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}${pathAfterV1}`;
  return `${trimmed}/v1${pathAfterV1}`;
}

function looksLikeChatCompletionsEndpoint(endpoint: string): boolean {
  return endpoint.includes("/chat/completions");
}

function toYYYYMMDD(value: string | undefined): string | null {
  if (!value) return null;
  // Accept already-normalized YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // ISO timestamps: YYYY-MM-DDTHH:mm:ssZ
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * MVP implementation note:
 * We keep the provider call shape configurable via env and treat the response as opaque.
 * This preserves provider-agnosticism while still enabling a "real" integration when env is set.
 */
export async function grokXSearch(params: GrokXSearchParams): Promise<GrokXSearchResult> {
  const apiKey = requireAnyEnv(["SIGNAL_GROK_API_KEY", "GROK_API_KEY"]);

  const explicitEndpoint = firstEnv(["SIGNAL_GROK_ENDPOINT"]);
  const baseUrl = firstEnv(["SIGNAL_GROK_BASE_URL", "GROK_BASE_URL"]);
  const enableXSearchTool =
    (firstEnv(["SIGNAL_GROK_ENABLE_X_SEARCH_TOOL"]) ?? "1").toLowerCase() !== "0";
  const responsesEndpointDefault = baseUrl ? withV1(baseUrl, "/responses") : undefined;

  let endpoint = explicitEndpoint ?? responsesEndpointDefault;
  if (!endpoint) {
    throw new Error(
      "Missing required env var for Grok x_search: SIGNAL_GROK_ENDPOINT (or SIGNAL_GROK_BASE_URL / GROK_BASE_URL)",
    );
  }
  // Always prefer Responses API. If endpoint points to chat/completions, auto-swap to /responses.
  if (looksLikeChatCompletionsEndpoint(endpoint)) {
    if (endpoint.includes("/v1/chat/completions")) {
      endpoint = endpoint.replace("/v1/chat/completions", "/v1/responses");
    } else if (responsesEndpointDefault) {
      endpoint = responsesEndpointDefault;
    }
  }

  const tier = readDefaultTier();
  // Use provided maxTextChars or fall back to tier-based default
  const maxTextChars = params.maxTextChars ?? (tier === "high" ? 1000 : 480);

  const model = firstEnv(["SIGNAL_GROK_MODEL"]) ?? "grok-4-1-fast-non-reasoning";
  // Generous defaults since x_search tool cost dominates token cost
  const maxTokensDefault = tier === "high" ? 4000 : 2000;
  const maxTokensEnv =
    parseIntEnv("SIGNAL_GROK_MAX_OUTPUT_TOKENS", process.env.SIGNAL_GROK_MAX_OUTPUT_TOKENS) ??
    maxTokensDefault;
  const hardCap =
    parseIntEnv(
      "X_POSTS_MAX_OUTPUT_TOKENS_HARD_CAP",
      process.env.X_POSTS_MAX_OUTPUT_TOKENS_HARD_CAP,
    ) ?? 32000;
  // Apply override if provided, clamped to hard cap
  const maxTokens = params.maxOutputTokens
    ? Math.min(params.maxOutputTokens, hardCap)
    : maxTokensEnv;

  const fromDate = toYYYYMMDD(params.fromDate ?? params.sinceTime);

  // NOTE: from_date/to_date tool params are broken (return stale cached data).
  // Instead, we inject since: into the query string itself, which works with
  // real-time search. We don't use until: because it's exclusive (posts BEFORE
  // that date), and same-day since/until returns empty. Deduplication by
  // external_id handles any overlap from fetching slightly beyond the window.
  const queryWithDates = fromDate ? `${params.query} since:${fromDate}` : params.query;

  const emitResultsSchema = {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "date", "url", "text", "user_handle", "user_display_name"],
          properties: {
            id: { type: "string" },
            date: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
            text: { type: "string" },
            user_handle: { type: ["string", "null"] },
            user_display_name: { type: ["string", "null"] },
            metrics: {
              type: "object",
              additionalProperties: false,
              required: ["reply_count", "repost_count", "like_count", "quote_count", "view_count"],
              properties: {
                reply_count: { type: "number" },
                repost_count: { type: "number" },
                like_count: { type: "number" },
                quote_count: { type: "number" },
                view_count: { type: "number" },
              },
            },
          },
        },
      },
    },
  };

  const emitResultsTool = {
    type: "function",
    name: "emit_results",
    description: "Return structured X post results",
    parameters: emitResultsSchema,
  };

  const tools = enableXSearchTool
    ? [
        {
          type: "x_search",
          ...(params.allowedXHandles && params.allowedXHandles.length > 0
            ? { allowed_x_handles: params.allowedXHandles }
            : {}),
        },
        emitResultsTool,
      ]
    : [emitResultsTool];

  const startedAt = Date.now();
  // System prompt optimized for canonical data + token safety
  // Let downstream triage decide relevance; only light noise filtering here
  const groupSize = params.allowedXHandles?.length || 1;
  const perAccountTarget = Math.floor(params.limit / groupSize);
  const batchingHint =
    groupSize > 1
      ? `\nThis query covers ${groupSize} accounts. Aim for ~${perAccountTarget} results per account, distributed fairly across all accounts.`
      : "";
  const systemPrompt = `Use the x_search tool to fetch real posts.
Then call the emit_results function with a JSON object containing a "results" array.
Do NOT output any normal assistant message or prose.
If the x_search tool is unavailable or returns no posts, call emit_results with {"results": []}.
Do NOT fabricate. If a field is unavailable from the tool results, use null.

Each result object MUST include:
- id (string, digits): the status ID
- date (string|null): prefer ISO 8601 UTC timestamp (e.g. 2026-01-08T05:23:00Z). If only day-level is available, use YYYY-MM-DD.
- url (string|null): status URL (https://x.com/<handle>/status/<id> or twitter.com). If tool doesn't provide url but you have id + user_handle, construct it.
- text (string): post text, <= ${maxTextChars} chars, no newlines (truncate with "..." if needed)
- user_handle (string|null): handle (with or without "@")
- user_display_name (string|null): display name shown on profile
- metrics (optional object): include ONLY if the tool provides counts; keys reply_count, repost_count, like_count, quote_count, view_count (all numbers)

Ordering: newest first. Return at most the requested limit.${batchingHint}

Light filtering (cost + quality):
- Exclude only obvious low-information noise (emoji-only, single-word reactions like "lol"/"true"/"yes", or empty text).
- Do NOT do "semantic" high-signal judging here; downstream triage handles relevance.`;

  const body = {
    model,
    // OpenAI-compatible Responses API shape.
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          `Query: ${JSON.stringify(queryWithDates)}\n` +
          `Mode: Latest\n` +
          `Return up to ${params.limit} results.`,
      },
    ],
    ...(tools ? { tools } : {}),
    tool_choice: "required",
    temperature: 0,
    stream: false,
    max_output_tokens: maxTokens,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const endedAt = Date.now();

  const contentType = res.headers.get("content-type") ?? "";
  let response: unknown;
  if (contentType.includes("application/json")) {
    response = await res.json();
  } else {
    response = await res.text();
  }

  if (!res.ok) {
    const detail = extractErrorDetail(response);
    const snippet = responseSnippet(response);
    const ms = endedAt - startedAt;
    const suffix = detail ? `: ${truncateString(detail, 300)}` : snippet ? `: ${snippet}` : "";
    const err = new Error(`Grok x_search error (${res.status}) after ${ms}ms${suffix}`);
    (err as unknown as Record<string, unknown>).statusCode = res.status;
    (err as unknown as Record<string, unknown>).statusText = res.statusText;
    (err as unknown as Record<string, unknown>).endpoint = endpoint;
    (err as unknown as Record<string, unknown>).model = model;
    (err as unknown as Record<string, unknown>).responseSnippet = snippet;
    (err as unknown as Record<string, unknown>).requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("xai-request-id") ??
      res.headers.get("cf-ray");
    throw err;
  }

  const usage = extractUsageTokens(response);
  const assistantText = extractAssistantContent(response);
  const assistantTextInfo = assistantText ? buildAssistantTextSnippets(assistantText) : null;
  const emitArgs = extractFunctionCallArguments(response, "emit_results");
  const emitArgsInfo = emitArgs ? buildAssistantTextSnippets(emitArgs) : null;
  const emitResultsPresent = Boolean(emitArgs);
  let assistantJson: Record<string, unknown> | undefined;
  let emitResultsParseError = false;
  if (emitArgs) {
    const parsedArgs = tryParseJsonObject(emitArgs);
    if (parsedArgs) {
      assistantJson = parsedArgs;
    } else {
      emitResultsParseError = true;
    }
  }

  const assistantParseError = emitResultsPresent ? emitResultsParseError : true;
  const structuredError = assistantText
    ? (extractStructuredErrorCodeFromText(assistantText) ?? undefined)
    : undefined;
  return {
    response,
    endpoint,
    model,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    assistantJson,
    assistantParseError,
    emitResultsPresent,
    emitResultsParseError,
    emitResultsArgsHead: emitArgsInfo?.head,
    emitResultsArgsTail: emitArgsInfo?.tail,
    emitResultsArgsLength: emitArgsInfo?.length,
    assistantTextHead: assistantTextInfo?.head,
    assistantTextTail: assistantTextInfo?.tail,
    assistantTextLength: assistantTextInfo?.length,
    structuredError,
  };
}
