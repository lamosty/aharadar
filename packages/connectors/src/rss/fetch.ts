import type { FetchParams, FetchResult } from "@aharadar/shared";
import { XMLParser } from "fast-xml-parser";

import { parseRssSourceConfig } from "./config";

// Cursor shape for RSS
interface RssCursorJson {
  last_published_at?: string; // ISO timestamp of most recent published date seen
  recent_guids?: string[]; // recent GUIDs (cap to ~200)
}

// Internal normalized entry shape
export interface RssRawEntry {
  guid: string | null;
  link: string | null;
  title: string | null;
  author: string | null;
  published_at: string | null; // ISO
  content_html: string | null;
  content_text: string | null;
  categories: string[];
  feed_url: string;
}

// --- Helpers ---

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value.trim();
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => asString(v))
      .filter((v): v is string => v !== null);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseCursor(cursor: Record<string, unknown>): RssCursorJson {
  const lastPublished = asString(cursor.last_published_at);
  const recentGuids = asStringArray(cursor.recent_guids);
  return {
    last_published_at: lastPublished ?? undefined,
    recent_guids: recentGuids.length > 0 ? recentGuids : undefined,
  };
}

// --- XML Parsing ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["item", "entry", "category", "author", "link"].includes(name),
});

export interface ParsedFeed {
  type: "rss" | "atom";
  entries: ParsedEntry[];
}

export interface ParsedEntry {
  guid: string | null;
  link: string | null;
  title: string | null;
  author: string | null;
  published: string | null;
  contentHtml: string | null;
  summary: string | null;
  categories: string[];
}

function extractText(value: unknown): string | null {
  // Handle arrays (take first element)
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return extractText(value[0]);
  }
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec["#text"] != null) return String(rec["#text"]).trim() || null;
    if (rec["#cdata"] != null) return String(rec["#cdata"]).trim() || null;
  }
  return null;
}

export function parseFeed(xmlText: string): ParsedFeed {
  const doc = parser.parse(xmlText);

  // Try RSS 2.0
  if (doc.rss?.channel) {
    const channel = asRecord(doc.rss.channel);
    const items = Array.isArray(channel.item) ? channel.item : [];
    return {
      type: "rss",
      entries: items.map((item) => parseRssItem(asRecord(item))),
    };
  }

  // Try Atom
  if (doc.feed) {
    const feed = asRecord(doc.feed);
    const entries = Array.isArray(feed.entry) ? feed.entry : [];
    return {
      type: "atom",
      entries: entries.map((entry) => parseAtomEntry(asRecord(entry))),
    };
  }

  // RSS 1.0 / RDF
  if (doc["rdf:RDF"]) {
    const rdf = asRecord(doc["rdf:RDF"]);
    const items = Array.isArray(rdf.item) ? rdf.item : [];
    return {
      type: "rss",
      entries: items.map((item) => parseRssItem(asRecord(item))),
    };
  }

  return { type: "rss", entries: [] };
}

function parseRssItem(item: Record<string, unknown>): ParsedEntry {
  // guid can be an object with @_isPermaLink and #text, or a plain string
  let guid: string | null = null;
  if (typeof item.guid === "string") {
    guid = item.guid;
  } else if (item.guid && typeof item.guid === "object") {
    const g = asRecord(item.guid);
    guid = extractText(g["#text"]) ?? extractText(g);
  }

  // link
  const link = extractText(item.link);

  // title
  const title = extractText(item.title);

  // author (dc:creator or author)
  const author = extractText(item["dc:creator"]) ?? extractText(item.author);

  // published date (pubDate or dc:date)
  const published = extractText(item.pubDate) ?? extractText(item["dc:date"]);

  // content:encoded or description
  const contentHtml = extractText(item["content:encoded"]) ?? null;
  const summary = extractText(item.description) ?? null;

  // categories
  const categoryRaw = item.category;
  let categories: string[] = [];
  if (Array.isArray(categoryRaw)) {
    categories = categoryRaw.map((c) => extractText(c)).filter((c): c is string => c !== null);
  } else if (categoryRaw) {
    const cat = extractText(categoryRaw);
    if (cat) categories = [cat];
  }

  return {
    guid,
    link,
    title,
    author,
    published,
    contentHtml,
    summary,
    categories,
  };
}

function parseAtomEntry(entry: Record<string, unknown>): ParsedEntry {
  // id
  const guid = extractText(entry.id);

  // link (may be array of link objects with @_href and @_rel)
  let link: string | null = null;
  if (Array.isArray(entry.link)) {
    // prefer alternate, then any with href
    for (const l of entry.link) {
      const lObj = asRecord(l);
      const rel = asString(lObj["@_rel"]);
      const href = asString(lObj["@_href"]);
      if (href && (rel === "alternate" || !link)) link = href;
    }
  } else if (entry.link) {
    const lObj = asRecord(entry.link);
    link = asString(lObj["@_href"]) ?? extractText(entry.link);
  }

  // title
  const title = extractText(entry.title);

  // author (may be object with name)
  let author: string | null = null;
  if (Array.isArray(entry.author)) {
    const first = asRecord(entry.author[0]);
    author = extractText(first.name);
  } else if (entry.author) {
    const a = asRecord(entry.author);
    author = extractText(a.name) ?? extractText(entry.author);
  }

  // published or updated
  const published = extractText(entry.published) ?? extractText(entry.updated);

  // content (may have @_type, #text, etc.)
  let contentHtml: string | null = null;
  if (entry.content) {
    const c = asRecord(entry.content);
    contentHtml = extractText(c["#text"]) ?? extractText(c) ?? extractText(entry.content);
  }

  // summary
  const summary = extractText(entry.summary);

  // categories
  let categories: string[] = [];
  if (Array.isArray(entry.category)) {
    for (const cat of entry.category) {
      const catObj = asRecord(cat);
      const term = asString(catObj["@_term"]) ?? extractText(cat);
      if (term) categories.push(term);
    }
  } else if (entry.category) {
    const catObj = asRecord(entry.category);
    const term = asString(catObj["@_term"]) ?? extractText(entry.category);
    if (term) categories = [term];
  }

  return {
    guid,
    link,
    title,
    author,
    published,
    contentHtml,
    summary,
    categories,
  };
}

// --- HTTP Fetch ---

async function fetchFeedXml(feedUrl: string): Promise<string> {
  const res = await fetch(feedUrl, {
    method: "GET",
    headers: {
      "User-Agent": "aharadar/0.x (rss connector)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RSS fetch failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`);
  }

  return res.text();
}

// --- Main Fetch ---

export async function fetchRss(params: FetchParams): Promise<FetchResult> {
  const config = parseRssSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const xmlText = await fetchFeedXml(config.feedUrl);
  const parsed = parseFeed(xmlText);

  const lastPublishedAt = cursorIn.last_published_at
    ? new Date(cursorIn.last_published_at)
    : null;
  const recentGuidsSet = new Set(cursorIn.recent_guids ?? []);

  const rawItems: RssRawEntry[] = [];
  let newestPublished: Date | null = null;
  const newGuids: string[] = [];

  for (const entry of parsed.entries) {
    if (rawItems.length >= config.maxItemCount) break;

    // Cursoring: skip entries we've already seen (best-effort)
    // 1) If entry has a GUID and we've seen it, skip
    if (entry.guid && recentGuidsSet.has(entry.guid)) continue;

    // 2) If entry has a published date older than last_published_at, skip
    //    (but only if we have a last_published_at cursor)
    const entryDate = entry.published ? new Date(entry.published) : null;
    if (lastPublishedAt && entryDate && entryDate <= lastPublishedAt) {
      // However, if GUID is new, we should still include it (some feeds reuse dates)
      // So only skip if we have no guid or guid was already seen
      if (!entry.guid) continue;
    }

    // Track newest published date
    if (entryDate && (!newestPublished || entryDate > newestPublished)) {
      newestPublished = entryDate;
    }

    // Track GUID for cursor
    if (entry.guid) newGuids.push(entry.guid);

    // Build raw item
    // Choose content based on preferContentEncoded
    let contentHtml = entry.contentHtml;
    let contentText = entry.summary;
    if (!config.preferContentEncoded) {
      // Prefer summary/description
      contentText = entry.summary ?? entry.contentHtml;
      contentHtml = entry.contentHtml;
    } else {
      // Prefer content:encoded
      contentHtml = entry.contentHtml ?? entry.summary;
      contentText = entry.summary;
    }

    const rawEntry: RssRawEntry = {
      guid: entry.guid,
      link: entry.link,
      title: entry.title,
      author: entry.author,
      published_at: entryDate?.toISOString() ?? null,
      content_html: contentHtml,
      content_text: contentText,
      categories: entry.categories,
      feed_url: config.feedUrl,
    };

    rawItems.push(rawEntry);
  }

  // Build next cursor
  const nextCursor: RssCursorJson = {};

  // Update last_published_at to the newest we saw (or keep existing if none)
  if (newestPublished) {
    nextCursor.last_published_at = newestPublished.toISOString();
  } else if (cursorIn.last_published_at) {
    nextCursor.last_published_at = cursorIn.last_published_at;
  }

  // Combine old guids with new, keeping most recent first, capped at 200
  const combinedGuids = [...newGuids, ...(cursorIn.recent_guids ?? [])];
  const uniqueGuids: string[] = [];
  const seenGuids = new Set<string>();
  for (const g of combinedGuids) {
    if (!seenGuids.has(g)) {
      seenGuids.add(g);
      uniqueGuids.push(g);
      if (uniqueGuids.length >= 200) break;
    }
  }
  if (uniqueGuids.length > 0) {
    nextCursor.recent_guids = uniqueGuids;
  }

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      feed_type: parsed.type,
      entries_found: parsed.entries.length,
      entries_after_cursor: rawItems.length,
      feed_url: config.feedUrl,
    },
  };
}
