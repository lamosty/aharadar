export interface GrokXSearchParams {
  query: string;
  limit: number;
  sinceId?: string;
  sinceTime?: string;
}

export interface GrokXSearchResult {
  /** Raw provider response (kept opaque; normalization extracts what it can). */
  response: unknown;
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

  const model = firstEnv(["SIGNAL_GROK_MODEL"]) ?? "grok-4-latest";

  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      // OpenAI-style chat body is commonly supported; if your endpoint expects a different shape,
      // point SIGNAL_GROK_ENDPOINT at a compatible shim.
      messages: [
        {
          role: "system",
          content:
            "You can access public X/Twitter search results. Return STRICT JSON. Schema: { results: [{ id?: string, created_at?: string, author?: string, text?: string, urls?: string[] }] }."
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
      temperature: 0
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
    throw new Error(`Signal provider error (${res.status}) after ${endedAt - startedAt}ms`);
  }

  return { response };
}


