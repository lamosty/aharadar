import { loadDotEnvIfPresent } from "@aharadar/shared";

loadDotEnvIfPresent();

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function withV1(baseUrl: string, pathAfterV1: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}${pathAfterV1}`;
  return `${trimmed}/v1${pathAfterV1}`;
}

function extractAssistantText(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const rec = response as Record<string, unknown>;

  if (typeof rec.output_text === "string" && rec.output_text.length > 0) return rec.output_text;

  const output = rec.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      if (it.type !== "message" || it.role !== "assistant") continue;
      const content = it.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== "object") continue;
          const p = part as Record<string, unknown>;
          if (p.type === "output_text" || p.type === "text") {
            const text = p.text;
            if (typeof text === "string" && text.length > 0) parts.push(text);
          }
        }
      }
    }
    if (parts.length > 0) return parts.join("");
  }

  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const msg = (first.message ?? {}) as Record<string, unknown>;
    const content = msg.content;
    if (typeof content === "string" && content.length > 0) return content;
  }

  return null;
}

async function main(): Promise<void> {
  const apiKey = firstEnv(["SIGNAL_GROK_API_KEY", "GROK_API_KEY"]);
  if (!apiKey) {
    console.error("Missing SIGNAL_GROK_API_KEY or GROK_API_KEY in env.");
    process.exit(1);
  }

  const explicitEndpoint = firstEnv(["SIGNAL_GROK_ENDPOINT"]);
  const baseUrl = firstEnv(["SIGNAL_GROK_BASE_URL", "GROK_BASE_URL"]) ?? "https://api.x.ai";
  const endpoint = explicitEndpoint ?? withV1(baseUrl, "/responses");

  const model = firstEnv(["SIGNAL_GROK_MODEL"]) ?? "grok-4-1-fast-non-reasoning";
  const handle = firstEnv(["GROK_TEST_HANDLE"]) ?? "naval";
  const limitRaw = firstEnv(["GROK_TEST_LIMIT"]) ?? "1";
  const limit = Number.parseInt(limitRaw, 10);

  const schema = {
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
  };

  const body = {
    model,
    input: [
      {
        role: "system",
        content:
          "Return STRICT JSON only. Output MUST be a JSON array matching the schema. No prose.",
      },
      {
        role: "user",
        content: `Query: ${JSON.stringify(`from:${handle}`)}\nMode: Latest\nReturn up to ${limit} results.`,
      },
    ],
    tools: [
      {
        type: "x_search",
        allowed_x_handles: [handle],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "x_posts_v1",
        schema,
        strict: true,
      },
    },
    temperature: 0,
    max_output_tokens: 800,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const response = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    console.error(`Grok error ${res.status}:`, response);
    process.exit(1);
  }

  const assistantText = extractAssistantText(response);
  if (!assistantText) {
    console.error("No assistant output text found.");
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(assistantText) as Array<Record<string, unknown>>;
    const first = parsed[0] ?? null;
    console.log("Structured output OK.");
    console.log("items:", parsed.length);
    if (first) {
      const text = typeof first.text === "string" ? first.text : "";
      console.log("first.id:", first.id);
      console.log("first.date:", first.date);
      console.log("first.url:", first.url);
      console.log("first.text_length:", text.length);
    }
  } catch (err) {
    console.error("JSON.parse failed:", err instanceof Error ? err.message : String(err));
    console.error("assistantText head:", assistantText.slice(0, 400));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
