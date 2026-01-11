import type { LlmCallResult, LlmRequest } from "./types";

/**
 * Check if a model supports reasoning_effort: "none".
 * gpt-5.1, gpt-5.2 and their variants support "none".
 * gpt-5-mini, gpt-5, o1, o3 series only support minimal/low/medium/high.
 */
function modelSupportsReasoningNone(model: string): boolean {
  const m = model.toLowerCase();
  // gpt-5.1.x and gpt-5.2.x support "none"
  if (m.includes("gpt-5.1") || m.includes("gpt-5.2")) return true;
  // gpt-5-mini, gpt-5-nano, plain gpt-5 do NOT support "none"
  return false;
}

/**
 * Get effective reasoning effort for models that don't support "none".
 * Maps "none" to "minimal" (lowest supported level) for those models.
 */
function getEffectiveReasoningEffort(
  model: string,
  effort: string | undefined,
): string | undefined {
  if (!effort) return undefined;
  if (effort === "none" && !modelSupportsReasoningNone(model)) {
    // Use "minimal" as the closest to "none" for models that don't support it
    return "minimal";
  }
  return effort;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
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

function responseSnippet(response: unknown): string | null {
  if (typeof response === "string") return truncateString(response, 800);
  try {
    const json = JSON.stringify(response);
    return truncateString(json, 800);
  } catch {
    return null;
  }
}

function extractAssistantContent(response: unknown): string | null {
  if (typeof response === "string" && response.length > 0) return response;
  const rec = asRecord(response);

  const outputText = rec.output_text;
  if (typeof outputText === "string" && outputText.length > 0) return outputText;

  const output = rec.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const it = asRecord(item);
      const directText =
        typeof it.text === "string"
          ? it.text
          : typeof it.output_text === "string"
            ? it.output_text
            : null;
      if (directText && directText.length > 0) return directText;
      if (it.type === "message" && it.role === "assistant") {
        const content = it.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p = asRecord(part);
            const text =
              typeof p.text === "string"
                ? p.text
                : typeof p.output_text === "string"
                  ? p.output_text
                  : null;
            if (text && text.length > 0) return text;
          }
        } else if (content && typeof content === "object" && !Array.isArray(content)) {
          const c = content as Record<string, unknown>;
          const text =
            typeof c.text === "string"
              ? c.text
              : typeof c.output_text === "string"
                ? c.output_text
                : null;
          if (text && text.length > 0) return text;
        } else if (typeof content === "string" && content.length > 0) {
          return content;
        }
      } else if (it.content && typeof it.content === "object" && !Array.isArray(it.content)) {
        const c = it.content as Record<string, unknown>;
        const text =
          typeof c.text === "string"
            ? c.text
            : typeof c.output_text === "string"
              ? c.output_text
              : null;
        if (text && text.length > 0) return text;
      } else if (typeof it.content === "string" && it.content.length > 0) {
        return it.content;
      }
    }
  }

  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = asRecord(choices[0]);
    const msg = asRecord(first.message);
    const content = msg.content;
    if (typeof content === "string" && content.length > 0) return content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const p = asRecord(part);
        const text =
          typeof p.text === "string"
            ? p.text
            : typeof p.output_text === "string"
              ? p.output_text
              : null;
        if (text && text.length > 0) return text;
      }
    }
  }

  return null;
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

type LlmProviderError = Error & {
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  model?: string;
  responseSnippet?: string | null;
  requestId?: string | null;
};

export async function callOpenAiCompat(params: {
  apiKey: string;
  endpoint: string;
  model: string;
  request: LlmRequest;
}): Promise<LlmCallResult> {
  // Determine effective reasoning effort for the request.
  // When user wants "none" but model doesn't support it, use "minimal" instead.
  const effectiveReasoning = getEffectiveReasoningEffort(
    params.model,
    params.request.reasoningEffort,
  );

  const body = {
    model: params.model,
    input: [
      { role: "system", content: params.request.system },
      { role: "user", content: params.request.user },
    ],
    stream: false,
    ...(params.request.temperature !== undefined
      ? { temperature: params.request.temperature }
      : {}),
    ...(params.request.maxOutputTokens
      ? { max_output_tokens: params.request.maxOutputTokens }
      : {}),
    ...(effectiveReasoning ? { reasoning: { effort: effectiveReasoning } } : {}),
  };

  const res = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const response: unknown = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const detail = extractErrorDetail(response);
    const snippet = responseSnippet(response);
    const suffix = detail ? `: ${truncateString(detail, 300)}` : snippet ? `: ${snippet}` : "";
    const err: LlmProviderError = new Error(`LLM provider error (${res.status})${suffix}`);
    err.statusCode = res.status;
    err.statusText = res.statusText;
    err.endpoint = params.endpoint;
    err.model = params.model;
    err.responseSnippet = snippet;
    err.requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("xai-request-id") ??
      res.headers.get("cf-ray");
    throw err;
  }

  const outputText = extractAssistantContent(response);
  if (!outputText) {
    const snippet = responseSnippet(response);
    const suffix = snippet ? `: ${snippet}` : "";
    const err: LlmProviderError = new Error(`LLM response missing output_text${suffix}`);
    err.responseSnippet = snippet;
    throw err;
  }

  const usage = extractUsageTokens(response);
  return {
    outputText: outputText.trim(),
    rawResponse: response,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    endpoint: params.endpoint,
  };
}
