import type { FetchParams } from "@aharadar/shared";
import { describe, expect, it } from "vitest";
import { normalizeXPosts, parseXStatusUrl } from "./normalize";

const baseParams: FetchParams = {
  userId: "test-user",
  sourceId: "test-source",
  sourceType: "x_posts",
  config: {},
  cursor: {},
  limits: { maxItems: 20 },
  windowStart: "2026-02-05T00:00:00.000Z",
  windowEnd: "2026-02-05T23:59:59.000Z",
};

describe("parseXStatusUrl", () => {
  it("parses x.com status URL", () => {
    const result = parseXStatusUrl("https://x.com/elonmusk/status/1234567890123456789");
    expect(result).toEqual({ handle: "elonmusk", statusId: "1234567890123456789" });
  });

  it("parses twitter.com status URL", () => {
    const result = parseXStatusUrl("https://twitter.com/elonmusk/status/1234567890123456789");
    expect(result).toEqual({ handle: "elonmusk", statusId: "1234567890123456789" });
  });

  it("parses x.com with www prefix", () => {
    const result = parseXStatusUrl("https://www.x.com/someuser/status/9876543210");
    expect(result).toEqual({ handle: "someuser", statusId: "9876543210" });
  });

  it("parses twitter.com with www prefix", () => {
    const result = parseXStatusUrl("https://www.twitter.com/someuser/status/9876543210");
    expect(result).toEqual({ handle: "someuser", statusId: "9876543210" });
  });

  it("handles handles with underscores", () => {
    const result = parseXStatusUrl("https://x.com/user_name_123/status/1111111111");
    expect(result).toEqual({ handle: "user_name_123", statusId: "1111111111" });
  });

  it("handles handles with numbers", () => {
    const result = parseXStatusUrl("https://x.com/user123/status/2222222222");
    expect(result).toEqual({ handle: "user123", statusId: "2222222222" });
  });

  it("returns nulls for non-X URLs", () => {
    expect(parseXStatusUrl("https://example.com/elonmusk/status/123")).toEqual({
      handle: null,
      statusId: null,
    });
  });

  it("returns nulls for X profile URLs (no status)", () => {
    expect(parseXStatusUrl("https://x.com/elonmusk")).toEqual({
      handle: null,
      statusId: null,
    });
  });

  it("returns nulls for malformed URLs", () => {
    expect(parseXStatusUrl("not-a-url")).toEqual({ handle: null, statusId: null });
    expect(parseXStatusUrl("")).toEqual({ handle: null, statusId: null });
  });

  it("returns nulls when status ID is missing", () => {
    expect(parseXStatusUrl("https://x.com/elonmusk/status/")).toEqual({
      handle: null,
      statusId: null,
    });
  });

  it("handles URL with query parameters", () => {
    const result = parseXStatusUrl("https://x.com/user/status/123456?s=20&t=abc");
    expect(result).toEqual({ handle: "user", statusId: "123456" });
  });
});

describe("normalizeXPosts", () => {
  it("reconstructs canonical URL from status id and handle when URL is missing", async () => {
    const result = await normalizeXPosts(
      {
        vendor: "grok",
        query: "from:aleabitoreddit",
        day_bucket: "2026-02-05",
        id: "2019405783562351021",
        user_handle: "@aleabitoreddit",
        url: null,
        text: "Silver is crashing.",
      },
      baseParams,
    );

    expect(result.canonicalUrl).toBe("https://x.com/aleabitoreddit/status/2019405783562351021");
    expect(result.externalId).toBe("2019405783562351021");
    expect(result.author).toBe("@aleabitoreddit");
    expect(result.metadata.post_url).toBe(
      "https://x.com/aleabitoreddit/status/2019405783562351021",
    );
  });

  it("normalizes twitter.com status URLs to x.com canonical URL", async () => {
    const result = await normalizeXPosts(
      {
        vendor: "grok",
        query: "from:user",
        day_bucket: "2026-02-05",
        url: "https://twitter.com/user/status/1234567890?s=20",
        text: "Post text",
      },
      baseParams,
    );

    expect(result.canonicalUrl).toBe("https://x.com/user/status/1234567890");
    expect(result.externalId).toBe("1234567890");
    expect(result.author).toBe("@user");
  });

  it("extracts canonical status URL from text when url field is missing", async () => {
    const result = await normalizeXPosts(
      {
        vendor: "grok",
        query: "topic query",
        day_bucket: "2026-02-05",
        text: "Context https://x.com/foo/status/777777 and more context",
      },
      baseParams,
    );

    expect(result.canonicalUrl).toBe("https://x.com/foo/status/777777");
    expect(result.externalId).toBe("777777");
    expect(result.author).toBe("@foo");
  });
});
