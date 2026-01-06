import { describe, it, expect } from "vitest";
import { parseFeed } from "./fetch";

// --- RSS 2.0 fixture ---
const RSS_2_0_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <description>An example RSS feed</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/first</link>
      <guid>guid-first-article</guid>
      <pubDate>Mon, 06 Jan 2025 12:00:00 GMT</pubDate>
      <description>Summary of the first article.</description>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/second</link>
      <guid isPermaLink="false">guid-second-article</guid>
      <pubDate>Mon, 06 Jan 2025 10:00:00 GMT</pubDate>
      <description>Summary of the second article.</description>
      <author>Jane Doe</author>
    </item>
  </channel>
</rss>`;

// --- Atom fixture ---
const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <id>urn:uuid:example-feed</id>
  <updated>2025-01-06T12:00:00Z</updated>
  <entry>
    <title>Atom Entry One</title>
    <id>urn:uuid:entry-one</id>
    <link href="https://example.com/atom-one" rel="alternate"/>
    <published>2025-01-06T11:00:00Z</published>
    <summary>Summary of Atom entry one.</summary>
    <author>
      <name>John Smith</name>
    </author>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <id>urn:uuid:entry-two</id>
    <link href="https://example.com/atom-two"/>
    <updated>2025-01-05T09:00:00Z</updated>
    <content type="html">&lt;p&gt;Full content of entry two.&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("parseFeed", () => {
  describe("RSS 2.0", () => {
    it("detects RSS 2.0 feed type", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.type).toBe("rss");
    });

    it("extracts all items", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries.length).toBe(2);
    });

    it("extracts title from RSS item", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].title).toBe("First Article");
      expect(result.entries[1].title).toBe("Second Article");
    });

    it("extracts link from RSS item", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].link).toBe("https://example.com/first");
      expect(result.entries[1].link).toBe("https://example.com/second");
    });

    it("extracts guid from RSS item", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].guid).toBe("guid-first-article");
      // GUID with isPermaLink attribute should still extract the text
      expect(result.entries[1].guid).toBe("guid-second-article");
    });

    it("extracts published date from RSS item", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].published).toBe("Mon, 06 Jan 2025 12:00:00 GMT");
      expect(result.entries[1].published).toBe("Mon, 06 Jan 2025 10:00:00 GMT");
    });

    it("extracts summary from RSS item description", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].summary).toBe("Summary of the first article.");
      expect(result.entries[1].summary).toBe("Summary of the second article.");
    });

    it("extracts author when present", () => {
      const result = parseFeed(RSS_2_0_FIXTURE);
      expect(result.entries[0].author).toBeNull();
      expect(result.entries[1].author).toBe("Jane Doe");
    });
  });

  describe("Atom", () => {
    it("detects Atom feed type", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.type).toBe("atom");
    });

    it("extracts all entries", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries.length).toBe(2);
    });

    it("extracts title from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].title).toBe("Atom Entry One");
      expect(result.entries[1].title).toBe("Atom Entry Two");
    });

    it("extracts link from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].link).toBe("https://example.com/atom-one");
      expect(result.entries[1].link).toBe("https://example.com/atom-two");
    });

    it("extracts id as guid from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].guid).toBe("urn:uuid:entry-one");
      expect(result.entries[1].guid).toBe("urn:uuid:entry-two");
    });

    it("extracts published or updated date from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].published).toBe("2025-01-06T11:00:00Z");
      // Falls back to updated when published is missing
      expect(result.entries[1].published).toBe("2025-01-05T09:00:00Z");
    });

    it("extracts author name from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].author).toBe("John Smith");
      expect(result.entries[1].author).toBeNull();
    });

    it("extracts summary from Atom entry", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].summary).toBe("Summary of Atom entry one.");
      // Entry two has content, not summary
      expect(result.entries[1].summary).toBeNull();
    });

    it("extracts contentHtml from Atom entry content", () => {
      const result = parseFeed(ATOM_FIXTURE);
      expect(result.entries[0].contentHtml).toBeNull();
      expect(result.entries[1].contentHtml).toBe("<p>Full content of entry two.</p>");
    });
  });

  describe("edge cases", () => {
    it("returns empty entries for empty/malformed XML", () => {
      const result = parseFeed("<invalid>not a feed</invalid>");
      expect(result.entries.length).toBe(0);
    });

    it("returns empty entries for empty string", () => {
      const result = parseFeed("");
      expect(result.entries.length).toBe(0);
    });
  });
});
