export interface GrokXSearchParams {
  query: string;
  limit: number;
  sinceId?: string;
  sinceTime?: string;
}

export interface GrokXSearchResult {
  /** Raw provider response (kept opaque; normalization extracts what it can). */
  response: unknown;
  endpoint: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
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
  throw new Error(`Missing required env var for signal search: one of ${names.join(", ")}`);
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

/**
 * MVP implementation note:
 * We keep the provider call shape configurable via env and treat the response as opaque.
 * This preserves provider-agnosticism while still enabling a "real" integration when env is set.
 */
export async function grokXSearch(params: GrokXSearchParams): Promise<GrokXSearchResult> {
  const apiKey = requireAnyEnv(["SIGNAL_GROK_API_KEY", "GROK_API_KEY"]);

  const explicitEndpoint = firstEnv(["SIGNAL_GROK_ENDPOINT"]);
  const baseUrl = firstEnv(["SIGNAL_GROK_BASE_URL", "GROK_BASE_URL"]);
  const endpoint =
    explicitEndpoint ?? (baseUrl ? `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions` : undefined);
  if (!endpoint) {
    throw new Error(
      "Missing required env var for signal search: SIGNAL_GROK_ENDPOINT (or SIGNAL_GROK_BASE_URL / GROK_BASE_URL)"
    );
  }

  const model = firstEnv(["SIGNAL_GROK_MODEL"]) ?? "grok-4-1-fast-non-reasoning";
  const maxTokens = parseIntEnv("SIGNAL_GROK_MAX_OUTPUT_TOKENS", process.env.SIGNAL_GROK_MAX_OUTPUT_TOKENS) ?? 600;

  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      stream: false,
      // OpenAI-style chat body is commonly supported; if your endpoint expects a different shape,
      // point SIGNAL_GROK_ENDPOINT at a compatible shim.
      messages: [
        {
          role: "system",
          content:
            "Return STRICT JSON only (no markdown, no prose). Schema: { results: Array<{ id: string|null, created_at: string|null, author: string|null, text_excerpt: string|null, urls: string[] }> }. Constraints: results.length <= limit; text_excerpt <= 200 chars; urls length <= 5; unknown fields => null."
        },
        {
          role: "user",
          content: JSON.stringify({
            query: params.query,
            limit: params.limit,
            since_id: params.sinceId ?? null,
            since_time: params.sinceTime ?? null
          })
        }
      ],
      temperature: 0,
      max_tokens: maxTokens
    })
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
    const err = new Error(`Signal provider error (${res.status}) after ${ms}ms${suffix}`);
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
  return { response, endpoint, model, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens };
}


