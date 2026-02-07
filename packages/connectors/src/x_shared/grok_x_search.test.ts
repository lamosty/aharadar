import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { grokXSearch } from "./grok_x_search";

function makeJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("grokXSearch parser path", () => {
  const original = {
    SIGNAL_GROK_API_KEY: process.env.SIGNAL_GROK_API_KEY,
    GROK_API_KEY: process.env.GROK_API_KEY,
    SIGNAL_GROK_BASE_URL: process.env.SIGNAL_GROK_BASE_URL,
    GROK_BASE_URL: process.env.GROK_BASE_URL,
    SIGNAL_GROK_ENDPOINT: process.env.SIGNAL_GROK_ENDPOINT,
  };

  beforeEach(() => {
    process.env.SIGNAL_GROK_API_KEY = "test-key";
    process.env.SIGNAL_GROK_BASE_URL = "https://grok.example";
    delete process.env.SIGNAL_GROK_ENDPOINT;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (original.SIGNAL_GROK_API_KEY === undefined) delete process.env.SIGNAL_GROK_API_KEY;
    else process.env.SIGNAL_GROK_API_KEY = original.SIGNAL_GROK_API_KEY;
    if (original.GROK_API_KEY === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = original.GROK_API_KEY;
    if (original.SIGNAL_GROK_BASE_URL === undefined) delete process.env.SIGNAL_GROK_BASE_URL;
    else process.env.SIGNAL_GROK_BASE_URL = original.SIGNAL_GROK_BASE_URL;
    if (original.GROK_BASE_URL === undefined) delete process.env.GROK_BASE_URL;
    else process.env.GROK_BASE_URL = original.GROK_BASE_URL;
    if (original.SIGNAL_GROK_ENDPOINT === undefined) delete process.env.SIGNAL_GROK_ENDPOINT;
    else process.env.SIGNAL_GROK_ENDPOINT = original.SIGNAL_GROK_ENDPOINT;
  });

  it("parses assistant output_text parts from Responses output[]", async () => {
    const validLine =
      "POST\t2026-02-07T12:00:00Z\t@alpha\t1234567890123456789\thttps://x.com/alpha/status/1234567890123456789\thello world";
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: validLine }],
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 22 },
      }),
    );

    const result = await grokXSearch({ query: "from:alpha", limit: 1 });
    expect(result.assistantParseError).toBe(false);
    expect(result.lineStats?.linesValid).toBe(1);
    expect(result.lineStats?.linesInvalid).toBe(0);
    const rows =
      (result.assistantJson?.results as Array<Record<string, unknown>> | undefined) ?? [];
    expect(rows[0]?.id).toBe("1234567890123456789");
    expect(rows[0]?.url).toBe("https://x.com/alpha/status/1234567890123456789");
  });

  it("does not parse output_text convenience field fallback", async () => {
    const validLine =
      "POST\t2026-02-07T12:00:00Z\t@alpha\t1234567890123456789\thttps://x.com/alpha/status/1234567890123456789\thello world";
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({
        output_text: validLine,
        usage: { prompt_tokens: 2, completion_tokens: 3 },
      }),
    );

    const result = await grokXSearch({ query: "from:alpha", limit: 1 });
    expect(result.assistantParseError).toBe(true);
    expect(result.assistantJson).toBeUndefined();
    expect(result.lineStats).toBeUndefined();
  });

  it("marks old pre-status-id line format as invalid", async () => {
    const oldFormatLine =
      "POST\t2026-02-07T12:00:00Z\t@alpha\thttps://x.com/alpha/status/1234567890123456789\thello world";
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: oldFormatLine }],
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3 },
      }),
    );

    const result = await grokXSearch({ query: "from:alpha", limit: 1 });
    expect(result.assistantParseError).toBe(true);
    expect(result.lineStats?.linesTotal).toBe(1);
    expect(result.lineStats?.linesValid).toBe(0);
    expect(result.lineStats?.linesInvalid).toBe(1);
  });
});
