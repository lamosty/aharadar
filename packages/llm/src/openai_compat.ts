import type { LlmCallResult, LlmRequest } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
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
  const rec = asRecord(response);

  const outputText = rec.output_text;
  if (typeof outputText === "string" && outputText.length > 0) return outputText;

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

  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = asRecord(choices[0]);
    const msg = asRecord(first.message);
    const content = msg.content;
    if (typeof content === "string" && content.length > 0) return content;
  }

  return null;
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

export async function callOpenAiCompat(params: {
  apiKey: string;
  endpoint: string;
  model: string;
  request: LlmRequest;
}): Promise<LlmCallResult> {
  const body = {
    model: params.model,
    input: [
      { role: "system", content: params.request.system },
      { role: "user", content: params.request.user },
    ],
    temperature: params.request.temperature ?? 0,
    stream: false,
    ...(params.request.maxOutputTokens ? { max_output_tokens: params.request.maxOutputTokens } : {}),
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
  const response: unknown = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = extractErrorDetail(response);
    const snippet = responseSnippet(response);
    const suffix = detail ? `: ${truncateString(detail, 300)}` : snippet ? `: ${snippet}` : "";
    const err = new Error(`LLM provider error (${res.status})${suffix}`);
    (err as Record<string, unknown>).statusCode = res.status;
    (err as Record<string, unknown>).statusText = res.statusText;
    (err as Record<string, unknown>).endpoint = params.endpoint;
    (err as Record<string, unknown>).model = params.model;
    (err as Record<string, unknown>).responseSnippet = snippet;
    (err as Record<string, unknown>).requestId =
      res.headers.get("x-request-id") ?? res.headers.get("xai-request-id") ?? res.headers.get("cf-ray");
    throw err;
  }

  const outputText = extractAssistantContent(response);
  if (!outputText) {
    throw new Error("LLM response missing output_text");
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
