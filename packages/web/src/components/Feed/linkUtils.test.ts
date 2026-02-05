import { describe, expect, it } from "vitest";
import { getPrimaryLinkUrl } from "./linkUtils";

describe("getPrimaryLinkUrl", () => {
  it("uses reddit permalink when source is reddit", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "reddit",
        originalUrl: "https://example.com/external",
        author: null,
        metadata: { permalink: "/r/investing/comments/abc123/post/" },
      }),
    ).toBe("https://www.reddit.com/r/investing/comments/abc123/post/");
  });

  it("prefers original URL over metadata and cluster fallbacks", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "x_posts",
        originalUrl: "https://x.com/user/status/111",
        author: "@user",
        metadata: { primary_url: "https://x.com/user/status/222" },
        clusterItems: [{ sourceType: "x_posts", url: "https://x.com/user/status/333" }],
      }),
    ).toBe("https://x.com/user/status/111");
  });

  it("falls back to metadata primary_url when original URL is missing", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "x_posts",
        originalUrl: null,
        author: "@user",
        metadata: { primary_url: "https://x.com/user/status/444" },
      }),
    ).toBe("https://x.com/user/status/444");
  });

  it("falls back to same-source cluster URL when representative URL is missing", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "x_posts",
        originalUrl: null,
        author: "@aleabitoreddit",
        metadata: {},
        clusterItems: [
          { sourceType: "reddit", url: "https://reddit.com/r/test/comments/1" },
          { sourceType: "x_posts", url: "https://x.com/aleabitoreddit/status/2019405783562351021" },
        ],
      }),
    ).toBe("https://x.com/aleabitoreddit/status/2019405783562351021");
  });

  it("falls back to x profile URL when no post URL is available", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "x_posts",
        originalUrl: null,
        author: "@aleabitoreddit",
        metadata: {},
        clusterItems: [{ sourceType: "x_posts", url: null }],
      }),
    ).toBe("https://x.com/aleabitoreddit");
  });

  it("returns null when no usable URL is available", () => {
    expect(
      getPrimaryLinkUrl({
        sourceType: "x_posts",
        originalUrl: null,
        author: null,
        metadata: { primary_url: "not-a-url" },
        clusterItems: [{ sourceType: "x_posts", url: null }],
      }),
    ).toBeNull();
  });
});
