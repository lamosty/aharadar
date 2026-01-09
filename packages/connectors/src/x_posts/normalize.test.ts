import { describe, expect, it } from "vitest";
import { parseXStatusUrl } from "./normalize";

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
