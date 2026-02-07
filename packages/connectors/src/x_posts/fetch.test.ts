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
  const originalDefaultPerAccount = process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT;
  const originalHeadroomPct = process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT;
  const originalHeadroomMin = process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN;

  beforeEach(() => {
    vi.mocked(grokXSearch).mockReset();
    delete process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT;
    delete process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT;
    delete process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN;
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalDefaultPerAccount === undefined) {
      delete process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT;
    } else {
      process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT = originalDefaultPerAccount;
    }
    if (originalHeadroomPct === undefined) {
      delete process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT;
    } else {
      process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT = originalHeadroomPct;
    }
    if (originalHeadroomMin === undefined) {
      delete process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN;
    } else {
      process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN = originalHeadroomMin;
    }
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

  it("adds headroom budget for batched calls without explicit per-account override", async () => {
    process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT = "1000";
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT = "0.25";
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN = "100";

    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 10,
      outputTokens: 10,
      assistantJson: { results: [] },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["alpha", "beta"],
          batching: { mode: "auto", batchSize: 2 },
          maxResultsPerQuery: 5,
        },
        limits: { maxItems: 10 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].maxOutputTokens).toBe(2500);

    const providerCalls = (
      result.meta as { providerCalls?: Array<{ meta?: Record<string, unknown> }> }
    ).providerCalls;
    expect(providerCalls?.[0]?.meta?.max_output_tokens_base).toBe(2000);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_headroom).toBe(500);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_mode).toBe("batched_default_per_account");
  });

  it("prefers source-config token knobs over env defaults", async () => {
    process.env.X_POSTS_DEFAULT_MAX_OUTPUT_TOKENS_PER_ACCOUNT = "700";
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT = "0.1";
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN = "50";

    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 10,
      outputTokens: 10,
      assistantJson: { results: [] },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["alpha", "beta"],
          batching: { mode: "auto", batchSize: 2 },
          batchedDefaultMaxOutputTokensPerAccount: 1200,
          outputTokenHeadroomPct: 0.5,
          outputTokenHeadroomMin: 200,
          maxResultsPerQuery: 5,
        },
        limits: { maxItems: 10 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].maxOutputTokens).toBe(3600);

    const providerCalls = (
      result.meta as { providerCalls?: Array<{ meta?: Record<string, unknown> }> }
    ).providerCalls;
    expect(providerCalls?.[0]?.meta?.max_output_tokens_base).toBe(2400);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_headroom).toBe(1200);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_mode).toBe("batched_default_per_account");
  });

  it("applies headroom to explicit maxOutputTokensPerAccount", async () => {
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_PCT = "0.1";
    process.env.X_POSTS_OUTPUT_TOKENS_HEADROOM_MIN = "50";

    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 10,
      outputTokens: 10,
      assistantJson: { results: [] },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["alpha", "beta", "gamma"],
          batching: { mode: "auto", batchSize: 3 },
          maxOutputTokensPerAccount: 1200,
          maxResultsPerQuery: 5,
        },
        limits: { maxItems: 20 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].maxOutputTokens).toBe(3960);

    const providerCalls = (
      result.meta as { providerCalls?: Array<{ meta?: Record<string, unknown> }> }
    ).providerCalls;
    expect(providerCalls?.[0]?.meta?.max_output_tokens_base).toBe(3600);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_headroom).toBe(360);
    expect(providerCalls?.[0]?.meta?.max_output_tokens_mode).toBe("per_account_override");
  });

  it("keeps provider default output budget for single-account calls without override", async () => {
    vi.mocked(grokXSearch).mockResolvedValue({
      response: {},
      endpoint: "https://example.test/v1/responses",
      model: "grok-4-1-fast-non-reasoning",
      inputTokens: 10,
      outputTokens: 10,
      assistantJson: { results: [] },
      assistantParseError: false,
    });

    const result = await fetchXPosts(
      baseParams({
        config: {
          vendor: "grok",
          accounts: ["alpha"],
          maxResultsPerQuery: 5,
        },
        limits: { maxItems: 5 },
      }),
    );

    expect(vi.mocked(grokXSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grokXSearch).mock.calls[0]?.[0].maxOutputTokens).toBeUndefined();

    const providerCalls = (
      result.meta as { providerCalls?: Array<{ meta?: Record<string, unknown> }> }
    ).providerCalls;
    expect(providerCalls?.[0]?.meta?.max_output_tokens_mode).toBe("provider_default");
  });
});
