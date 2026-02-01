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

function toYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function truncateJson(value: unknown, maxChars: number): string {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}…`;
}

function summarizeOutputItem(item: Record<string, unknown>, index: number): void {
  const type = typeof item.type === "string" ? item.type : "unknown";
  const name = typeof item.name === "string" ? item.name : undefined;
  const toolName = typeof item.tool_name === "string" ? item.tool_name : undefined;
  const keys = Object.keys(item);
  console.log(
    `output[${index}] type=${type}`,
    name ? `name=${name}` : "",
    toolName ? `tool=${toolName}` : "",
  );
  console.log(`output[${index}] keys=${keys.join(", ")}`);

  if (type.includes("tool") || type.includes("function") || toolName === "x_search") {
    console.log(`output[${index}] raw (truncated):`);
    console.log(truncateJson(item, 2400));
  }
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
  const limit = Number.parseInt(firstEnv(["GROK_TEST_LIMIT"]) ?? "1", 10);
  const includeReplies = (firstEnv(["GROK_TEST_INCLUDE_REPLIES"]) ?? "0") === "1";
  const includeRetweets = (firstEnv(["GROK_TEST_INCLUDE_RETWEETS"]) ?? "0") === "1";
  const sinceDays = Number.parseInt(firstEnv(["GROK_TEST_SINCE_DAYS"]) ?? "7", 10);

  const sinceDate = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000);
  const filters: string[] = [];
  if (!includeReplies) filters.push("-filter:replies");
  if (!includeRetweets) filters.push("-filter:retweets");
  const query = `from:${handle}${filters.length > 0 ? ` ${filters.join(" ")}` : ""} since:${toYYYYMMDD(sinceDate)}`;

  console.log("Endpoint:", endpoint);
  console.log("Model:", model);
  console.log("Query:", query);
  console.log("Limit:", limit);

  const emitSchema = {
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
          "Use the x_search tool to fetch posts. Then call emit_results with the post fields. Do not write any normal assistant message.",
      },
      {
        role: "user",
        content: `Query: ${JSON.stringify(query)}\nMode: Latest\nReturn up to ${limit} results.`,
      },
    ],
    tools: [
      {
        type: "x_search",
        allowed_x_handles: [handle],
      },
      {
        type: "function",
        name: "emit_results",
        description: "Return structured X post results",
        parameters: emitSchema,
      },
    ],
    tool_choice: "required",
    temperature: 0,
    max_output_tokens: 400,
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

  const rec = asRecord(response);
  const output = Array.isArray(rec.output) ? rec.output : [];
  console.log("Output items:", output.length);

  output.forEach((item, index) => {
    if (item && typeof item === "object") {
      summarizeOutputItem(item as Record<string, unknown>, index);
    } else {
      console.log(`output[${index}] non-object`);
    }
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
