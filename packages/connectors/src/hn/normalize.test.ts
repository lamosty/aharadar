import { describe, it, expect } from "vitest";
import { normalizeHn } from "./normalize";
import type { FetchParams } from "@aharadar/shared";

// Mock FetchParams for testing
const mockParams: FetchParams = {
  userId: "test-user",
  sourceId: "test-source",
  sourceType: "hn",
  config: {},
  cursor: {},
  limits: { maxItems: 50 },
  windowStart: "2025-01-05T00:00:00Z",
  windowEnd: "2025-01-06T00:00:00Z",
};

// --- HN raw item fixtures ---
const HN_STORY_WITH_URL = {
  id: 12345678,
  type: "story",
  by: "testuser",
  time: 1736150400, // 2025-01-06T08:00:00Z
  title: "Show HN: A Test Project",
  text: null,
  url: "https://example.com/project",
  score: 42,
  descendants: 15,
};

const HN_STORY_WITHOUT_URL = {
  id: 87654321,
  type: "story",
  by: "anotheruser",
  time: 1736157600, // 2025-01-06T10:00:00Z
  title: "Ask HN: What's your favorite editor?",
  text: "<p>I&#x27;m curious what editors people prefer.</p>",
  url: null,
  score: 100,
  descendants: 250,
};

const HN_STORY_MINIMAL = {
  id: 11111111,
  type: "story",
  by: null,
  time: null,
  title: "Minimal Story",
  text: null,
  url: null,
  score: null,
  descendants: null,
};

describe("normalizeHn", () => {
  describe("canonical URL", () => {
    it("uses url when present", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.canonicalUrl).toBe("https://example.com/project");
    });

    it("falls back to HN item URL when url is missing", async () => {
      const result = await normalizeHn(HN_STORY_WITHOUT_URL, mockParams);
      expect(result.canonicalUrl).toBe("https://news.ycombinator.com/item?id=87654321");
    });

    it("uses HN item URL for minimal story", async () => {
      const result = await normalizeHn(HN_STORY_MINIMAL, mockParams);
      expect(result.canonicalUrl).toBe("https://news.ycombinator.com/item?id=11111111");
    });
  });

  describe("external ID", () => {
    it("converts story id to string", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.externalId).toBe("12345678");
    });
  });

  describe("published_at conversion", () => {
    it("converts unix time to ISO string", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.publishedAt).toBe("2025-01-06T08:00:00.000Z");
    });

    it("handles different unix timestamps correctly", async () => {
      const result = await normalizeHn(HN_STORY_WITHOUT_URL, mockParams);
      expect(result.publishedAt).toBe("2025-01-06T10:00:00.000Z");
    });

    it("returns null when time is missing", async () => {
      const result = await normalizeHn(HN_STORY_MINIMAL, mockParams);
      expect(result.publishedAt).toBeNull();
    });
  });

  describe("title and author", () => {
    it("extracts title", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.title).toBe("Show HN: A Test Project");
    });

    it("extracts author from by field", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.author).toBe("testuser");
    });

    it("handles missing author", async () => {
      const result = await normalizeHn(HN_STORY_MINIMAL, mockParams);
      expect(result.author).toBeNull();
    });
  });

  describe("body text with HTML stripping", () => {
    it("strips HTML from text field", async () => {
      const result = await normalizeHn(HN_STORY_WITHOUT_URL, mockParams);
      expect(result.bodyText).toBe("I'm curious what editors people prefer.");
    });

    it("returns null when text is missing", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.bodyText).toBeNull();
    });
  });

  describe("metadata", () => {
    it("includes score in metadata", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.metadata.score).toBe(42);
    });

    it("includes descendants in metadata", async () => {
      const result = await normalizeHn(HN_STORY_WITHOUT_URL, mockParams);
      expect(result.metadata.descendants).toBe(250);
    });

    it("includes type in metadata", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.metadata.type).toBe("story");
    });

    it("includes url in metadata when present", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.metadata.url).toBe("https://example.com/project");
    });

    it("omits url from metadata when missing", async () => {
      const result = await normalizeHn(HN_STORY_WITHOUT_URL, mockParams);
      expect(result.metadata.url).toBeUndefined();
    });
  });

  describe("source type", () => {
    it("sets sourceType to hn", async () => {
      const result = await normalizeHn(HN_STORY_WITH_URL, mockParams);
      expect(result.sourceType).toBe("hn");
    });
  });
});
