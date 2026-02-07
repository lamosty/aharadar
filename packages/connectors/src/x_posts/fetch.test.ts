import type { FetchParams } from "@aharadar/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../x_shared/grok_x_search", () => ({
  grokXSearch: vi.fn(),
}));

import { grokXSearch } from "../x_shared/grok_x_search";
import { fetchXPosts } from "./fetch";

function baseParams(overrides: Partial<FetchParams> = {}): FetchParams {
  return {
    userId: "user-1",
    sourceId: "source-1",
    sourceType: "x_posts",
    config: { vendor: "grok", accounts: ["alpha"] },
    cursor: {},
    limits: { maxItems: 20 },
    windowStart: "2026-02-07T00:00:00.000Z",
    windowEnd: "2026-02-07T23:59:59.000Z",
    ...overrides,
  };
}

describe("fetchXPosts", () => {
  beforeEach(() => {
    vi.mocked(grokXSearch).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enforces limits.maxItems as a total cap across all query jobs", async () => {
    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 10,
      outputTokens: 10,
      assistantJson: {
        results: [
          { id: "1", date: "2026-02-07T10:00:00Z", url: "https://x.com/a/status/1", text: "p1" },
          { id: "2", date: "2026-02-07T09:00:00Z", url: "https://x.com/a/status/2", text: "p2" },
          { id: "3", date: "2026-02-07T08:00:00Z", url: "https://x.com/a/status/3", text: "p3" },
          { id: "4", date: "2026-02-07T07:00:00Z", url: "https://x.com/a/status/4", text: "p4" },
        ],
      },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["alpha", "beta"],
          maxResultsPerQuery: 20,
        },
        limits: { maxItems: 3 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].limit).toBe(3);
    expect(result.rawItems).toHaveLength(3);
  });

  it("does not fabricate post date when Grok omits timestamp", async () => {
    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 5,
      outputTokens: 5,
      assistantJson: {
        results: [{ id: "123", url: "https://x.com/alpha/status/123", text: "hello world" }],
      },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          queries: ["from:alpha"],
          maxResultsPerQuery: 5,
        },
      }),
    );

    expect(result.rawItems).toHaveLength(1);
    const first = result.rawItems[0] as { date?: unknown };
    expect(first.date).toBeNull();
  });

  it("splits oversized batches to max 5 handles per Grok call", async () => {
    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 5,
      outputTokens: 5,
      assistantJson: { results: [] },
      assistantParseError: false,
    });

    await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["a1", "a2", "a3", "a4", "a5", "a6"],
          maxResultsPerQuery: 2,
          batching: {
            mode: "auto",
            batchSize: 10,
          },
        },
        limits: { maxItems: 20 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].allowedXHandles).toHaveLength(5);
    expect(vi.mocked(grokXSearch).mock.calls[1]?.[0].allowedXHandles).toHaveLength(1);
  });
});
