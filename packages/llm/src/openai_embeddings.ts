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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractUsageTokens(response: unknown): { inputTokens: number } | null {
  const obj = asRecord(response);
  const usage = obj.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const u = usage as Record<string, unknown>;

  const prompt = asNumber(u.prompt_tokens) ?? asNumber(u.input_tokens) ?? asNumber(u.total_tokens);
  if (prompt === null) return null;
  return { inputTokens: prompt };
}

function extractEmbeddings(response: unknown, expectedCount: number): number[][] | null {
  const obj = asRecord(response);
  const data = obj.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  // OpenAI returns entries with { index, embedding: number[] }.
  const entries: Array<{ index: number; embedding: number[] }> = [];
  for (const item of data) {
    const it = asRecord(item);
    const idx = asNumber(it.index);
    const emb = it.embedding;
    if (idx === null || !Array.isArray(emb)) continue;
    const vec: number[] = [];
    for (const n of emb) {
      if (typeof n !== "number" || !Number.isFinite(n)) return null;
      vec.push(n);
    }
    entries.push({ index: idx, embedding: vec });
  }
  if (entries.length === 0) return null;

  entries.sort((a, b) => a.index - b.index);
  const vectors = entries.map((e) => e.embedding);
  if (expectedCount > 0 && vectors.length !== expectedCount) return null;
  return vectors;
}

type EmbeddingsProviderError = Error & {
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  model?: string;
  responseSnippet?: string | null;
  requestId?: string | null;
};

export async function callOpenAiEmbeddingsCompat(params: {
  apiKey: string;
  endpoint: string;
  model: string;
  input: string[];
}): Promise<{ vectors: number[][]; inputTokens: number; rawResponse: unknown; endpoint: string }> {
  const body = {
    model: params.model,
    input: params.input,
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
    const err: EmbeddingsProviderError = new Error(
      `Embeddings provider error (${res.status})${suffix}`,
    );
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

  const vectors = extractEmbeddings(response, params.input.length);
  if (!vectors) {
    const snippet = responseSnippet(response);
    const suffix = snippet ? `: ${snippet}` : "";
    const err: EmbeddingsProviderError = new Error(`Embeddings response missing vectors${suffix}`);
    err.responseSnippet = snippet;
    throw err;
  }

  const usage = extractUsageTokens(response);
  return {
    vectors,
    inputTokens: usage?.inputTokens ?? 0,
    rawResponse: response,
    endpoint: params.endpoint,
  };
}
