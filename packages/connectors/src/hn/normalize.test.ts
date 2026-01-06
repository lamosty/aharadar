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

  describe("missing id edge case", () => {
    const HN_STORY_NO_ID = {
      id: null,
      type: "story",
      by: "testuser",
      time: 1736150400,
      title: "Story without ID",
      text: null,
      url: "https://example.com/story",
      score: 10,
      descendants: 5,
    };

    it("returns null externalId when id is missing", async () => {
      const result = await normalizeHn(HN_STORY_NO_ID, mockParams);
      expect(result.externalId).toBeNull();
    });

    it("uses url as canonicalUrl when id is missing but url is present", async () => {
      const result = await normalizeHn(HN_STORY_NO_ID, mockParams);
      expect(result.canonicalUrl).toBe("https://example.com/story");
    });

    it("returns null canonicalUrl when both id and url are missing", async () => {
      const noIdNoUrl = { ...HN_STORY_NO_ID, url: null };
      const result = await normalizeHn(noIdNoUrl, mockParams);
      expect(result.canonicalUrl).toBeNull();
    });

    it("does not throw when id is missing", async () => {
      await expect(normalizeHn(HN_STORY_NO_ID, mockParams)).resolves.not.toThrow();
    });
  });

  describe("non-story types", () => {
    const HN_JOB = {
      id: 99999001,
      type: "job",
      by: "ycombinator",
      time: 1736150400,
      title: "YC is hiring",
      text: "<p>We&#x27;re looking for engineers.</p>",
      url: "https://ycombinator.com/jobs",
      score: null,
      descendants: null,
    };

    const HN_POLL = {
      id: 99999002,
      type: "poll",
      by: "pollster",
      time: 1736150400,
      title: "Favorite programming language?",
      text: "Vote for your favorite!",
      url: null,
      score: 500,
      descendants: 120,
    };

    it("normalizes job type without throwing", async () => {
      await expect(normalizeHn(HN_JOB, mockParams)).resolves.not.toThrow();
    });

    it("preserves job type in metadata", async () => {
      const result = await normalizeHn(HN_JOB, mockParams);
      expect(result.metadata.type).toBe("job");
    });

    it("normalizes poll type without throwing", async () => {
      await expect(normalizeHn(HN_POLL, mockParams)).resolves.not.toThrow();
    });

    it("preserves poll type in metadata", async () => {
      const result = await normalizeHn(HN_POLL, mockParams);
      expect(result.metadata.type).toBe("poll");
    });

    it("extracts title and author for non-story types", async () => {
      const result = await normalizeHn(HN_JOB, mockParams);
      expect(result.title).toBe("YC is hiring");
      expect(result.author).toBe("ycombinator");
    });
  });

  describe("HTML stripping robustness", () => {
    const HN_STORY_WITH_COMPLEX_HTML = {
      id: 99999003,
      type: "story",
      by: "htmlmaster",
      time: 1736150400,
      title: "Complex HTML Test",
      text: `<script>alert('xss')</script>
<style>.malicious { color: red; }</style>
<p>First paragraph.</p>
<p>Second paragraph with <a href="http://example.com">a link</a>.</p>
<div>Entities: &amp; &lt;tag&gt; &quot;quoted&quot; &#39;apostrophe&#39; &#x27;hex apostrophe&#x27;</div>
<br>Line break above.`,
      url: null,
      score: 42,
      descendants: 10,
    };

    it("removes script blocks", async () => {
      const result = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result.bodyText).not.toContain("script");
      expect(result.bodyText).not.toContain("alert");
      expect(result.bodyText).not.toContain("xss");
    });

    it("removes style blocks", async () => {
      const result = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result.bodyText).not.toContain("style");
      expect(result.bodyText).not.toContain("malicious");
      expect(result.bodyText).not.toContain("color");
    });

    it("decodes HTML entities", async () => {
      const result = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result.bodyText).toContain("&");
      // Note: &lt;tag&gt; becomes <tag> which is then stripped as an HTML tag
      expect(result.bodyText).toContain('"quoted"');
      expect(result.bodyText).toContain("'apostrophe'");
      expect(result.bodyText).toContain("'hex apostrophe'");
    });

    it("removes anchor tags but preserves text content", async () => {
      const result = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result.bodyText).toContain("a link");
      expect(result.bodyText).not.toContain("<a");
      expect(result.bodyText).not.toContain("href");
    });

    it("converts block elements to newlines", async () => {
      const result = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result.bodyText).toContain("First paragraph.");
      expect(result.bodyText).toContain("Second paragraph");
      // Should have some structure preserved via newlines
      expect(result.bodyText?.includes("\n")).toBe(true);
    });

    it("produces deterministic output", async () => {
      const result1 = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      const result2 = await normalizeHn(HN_STORY_WITH_COMPLEX_HTML, mockParams);
      expect(result1.bodyText).toBe(result2.bodyText);
    });
  });

  describe("missing time edge case", () => {
    const HN_STORY_NO_TIME = {
      id: 99999004,
      type: "story",
      by: "timeless",
      time: null,
      title: "Story without time",
      text: null,
      url: "https://example.com/timeless",
      score: 5,
      descendants: 0,
    };

    it("does not throw when time is missing", async () => {
      await expect(normalizeHn(HN_STORY_NO_TIME, mockParams)).resolves.not.toThrow();
    });

    it("returns null publishedAt when time is missing", async () => {
      const result = await normalizeHn(HN_STORY_NO_TIME, mockParams);
      expect(result.publishedAt).toBeNull();
    });
  });
});
