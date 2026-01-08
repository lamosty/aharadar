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
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
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

function extractAssistantContent(response: unknown): string | null {
  const rec = asRecord(response);

  // OpenAI-compatible Responses API: output_text is a convenience field.
  const outputText = rec.output_text;
  if (typeof outputText === "string" && outputText.length > 0) return outputText;

  // Responses API: output[] may contain an assistant message with output_text parts.
  const output = rec.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const it = asRecord(item);
      if (it.type === "message" && it.role === "assistant") {
        const content = it.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p = asRecord(part);
            if (p.type === "output_text" || p.type === "text") {
              const text = p.text;
              if (typeof text === "string" && text.length > 0) return text;
            }
          }
        }
      }
    }
  }

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

function extractStructuredErrorCode(response: unknown): { code: string; message: string | null } | null {
  const content = extractAssistantContent(response);
  if (!content) return null;
  const obj = tryParseJsonObject(content);
  if (!obj) return null;
  const err = obj.error;
  if (!err || typeof err !== "object" || Array.isArray(err)) return null;
  const code = (err as Record<string, unknown>).code;
  const message = (err as Record<string, unknown>).message;
  if (typeof code !== "string" || code.length === 0) return null;
  return { code, message: typeof message === "string" && message.length > 0 ? message : null };
}

function extractAssistantJson(response: unknown): Record<string, unknown> | null {
  const content = extractAssistantContent(response);
  if (!content) return null;
  return tryParseJsonObject(content);
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

function extractUsageTokens(response: unknown): { inputTokens: number; outputTokens: number } | null {
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
  const enableXSearchTool = (firstEnv(["SIGNAL_GROK_ENABLE_X_SEARCH_TOOL"]) ?? "1").toLowerCase() !== "0";
  const responsesEndpointDefault = baseUrl ? withV1(baseUrl, "/responses") : undefined;

  let endpoint = explicitEndpoint ?? responsesEndpointDefault;
  if (!endpoint) {
    throw new Error(
      "Missing required env var for Grok x_search: SIGNAL_GROK_ENDPOINT (or SIGNAL_GROK_BASE_URL / GROK_BASE_URL)"
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
  const maxTextChars = tier === "high" ? 1000 : 480;

  const model = firstEnv(["SIGNAL_GROK_MODEL"]) ?? "grok-4-1-fast-non-reasoning";
  const maxTokensDefault = tier === "high" ? 2000 : 900;
  const maxTokens =
    parseIntEnv("SIGNAL_GROK_MAX_OUTPUT_TOKENS", process.env.SIGNAL_GROK_MAX_OUTPUT_TOKENS) ??
    maxTokensDefault;

  const fromDate = toYYYYMMDD(params.fromDate ?? params.sinceTime);
  const toDate = toYYYYMMDD(params.toDate);

  const tools = enableXSearchTool
    ? [
        {
          type: "x_search",
          ...(params.allowedXHandles && params.allowedXHandles.length > 0
            ? { allowed_x_handles: params.allowedXHandles }
            : {}),
          ...(fromDate ? { from_date: fromDate } : {}),
          ...(toDate ? { to_date: toDate } : {}),
        },
      ]
    : undefined;

  const startedAt = Date.now();
  const body = {
    model,
    // OpenAI-compatible Responses API shape.
    input: [
      {
        role: "system",
        content: `Return STRICT JSON only (no markdown, no prose). Output MUST be a JSON array. Each item MUST be { date: "YYYY-MM-DD", url: "https://x.com/...", text: "...", user_display_name: "..." }. user_display_name is the user's display name (not username/handle - the display name that appears above @handle on their profile). If display name is unknown, set to null. Selection: include only high-signal posts (novel/meaningful/insightful). Prefer excluding obvious low-signal noise like emoji-only posts or pure acknowledgements/reactions (e.g. "True", "Yes", "No", "lol") when they add no information. Short posts are allowed if they still communicate a clear idea/claim/information. Do not over-filter: when unsure, include. Text: text MUST be a single line (no newlines) and <= ${maxTextChars} characters (truncate if needed). If there are no qualifying results, return []. Never fabricate posts.`,
      },
      {
        role: "user",
        content:
          `Search X for query: ${JSON.stringify(params.query)} (mode: Latest). ` +
          `Return at most ${params.limit} results as JSON (return fewer if only fewer qualify). ` +
          `If a tool is available, use it to fetch real posts; do not guess or fabricate.`,
      },
    ],
    ...(tools ? { tools } : {}),
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
      res.headers.get("x-request-id") ?? res.headers.get("xai-request-id") ?? res.headers.get("cf-ray");
    throw err;
  }

  const usage = extractUsageTokens(response);
  const assistantJson = extractAssistantJson(response) ?? undefined;
  const structuredError = extractStructuredErrorCode(response) ?? undefined;
  return {
    response,
    endpoint,
    model,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    assistantJson,
    structuredError,
  };
}
