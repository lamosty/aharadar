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

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var for signal search: ${name}`);
  }
  return value;
}

/**
 * MVP implementation note:
 * We keep the provider call shape configurable via env and treat the response as opaque.
 * This preserves provider-agnosticism while still enabling a "real" integration when env is set.
 */
export async function grokXSearch(params: GrokXSearchParams): Promise<GrokXSearchResult> {
  const endpoint = requireEnv("SIGNAL_GROK_ENDPOINT", process.env.SIGNAL_GROK_ENDPOINT);
  const apiKey = requireEnv("SIGNAL_GROK_API_KEY", process.env.SIGNAL_GROK_API_KEY);
  const model = process.env.SIGNAL_GROK_MODEL ?? "grok";

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


