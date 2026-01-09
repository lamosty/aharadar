import type { FetchParams, FetchResult } from "@aharadar/shared";
import { XMLParser } from "fast-xml-parser";

import { parseYoutubeSourceConfig } from "./config";

// Cursor shape for YouTube
interface YoutubeCursorJson {
  last_published_at?: string; // ISO timestamp of most recent published date seen
  recent_video_ids?: string[]; // recent video IDs (cap to ~100)
}

// Internal normalized entry shape
export interface YoutubeRawEntry {
  video_id: string;
  channel_id: string;
  title: string | null;
  description: string | null;
  author: string | null;
  published_at: string | null; // ISO
  updated_at: string | null; // ISO
  thumbnail_url: string | null;
  canonical_url: string;
}

// --- Helpers ---

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value.trim();
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter((v): v is string => v !== null);
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

function parseCursor(cursor: Record<string, unknown>): YoutubeCursorJson {
  const lastPublished = asString(cursor.last_published_at);
  const recentVideoIds = asStringArray(cursor.recent_video_ids);
  return {
    last_published_at: lastPublished ?? undefined,
    recent_video_ids: recentVideoIds.length > 0 ? recentVideoIds : undefined,
  };
}

// --- XML Parsing ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["entry", "link", "author"].includes(name),
});

interface ParsedYoutubeEntry {
  videoId: string;
  channelId: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  published: string | null;
  updated: string | null;
  thumbnailUrl: string | null;
  link: string | null;
}

function extractText(value: unknown): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return extractText(value[0]);
  }
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec["#text"] != null) return String(rec["#text"]).trim() || null;
  }
  return null;
}

function parseYoutubeFeed(xmlText: string): {
  entries: ParsedYoutubeEntry[];
  feedChannelId: string | null;
} {
  const doc = parser.parse(xmlText);

  if (!doc.feed) {
    return { entries: [], feedChannelId: null };
  }

  const feed = asRecord(doc.feed);
  const entries = Array.isArray(feed.entry) ? feed.entry : [];

  // Get channel ID from feed level if available
  const feedChannelId = asString(feed["yt:channelId"]);

  const parsedEntries: ParsedYoutubeEntry[] = [];

  for (const entry of entries) {
    const e = asRecord(entry);

    // Video ID is required
    const videoId = asString(e["yt:videoId"]);
    if (!videoId) continue;

    // Channel ID
    const channelId = asString(e["yt:channelId"]) ?? feedChannelId;

    // Title
    const title = extractText(e.title);

    // Description from media:group/media:description
    let description: string | null = null;
    const mediaGroup = asRecord(e["media:group"]);
    if (mediaGroup) {
      description = extractText(mediaGroup["media:description"]);
    }

    // Author (channel name)
    let author: string | null = null;
    if (Array.isArray(e.author)) {
      const firstAuthor = asRecord(e.author[0]);
      author = extractText(firstAuthor.name);
    }

    // Dates
    const published = extractText(e.published);
    const updated = extractText(e.updated);

    // Thumbnail from media:group/media:thumbnail
    let thumbnailUrl: string | null = null;
    if (mediaGroup) {
      const thumbnail = asRecord(mediaGroup["media:thumbnail"]);
      thumbnailUrl = asString(thumbnail["@_url"]);
    }

    // Link (prefer alternate)
    let link: string | null = null;
    if (Array.isArray(e.link)) {
      for (const l of e.link) {
        const lObj = asRecord(l);
        const rel = asString(lObj["@_rel"]);
        const href = asString(lObj["@_href"]);
        if (href && (rel === "alternate" || !link)) link = href;
      }
    }

    parsedEntries.push({
      videoId,
      channelId,
      title,
      description,
      author,
      published,
      updated,
      thumbnailUrl,
      link,
    });
  }

  return { entries: parsedEntries, feedChannelId };
}

// --- HTTP Fetch ---

async function fetchYoutubeFeedXml(channelId: string): Promise<string> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

  const res = await fetch(feedUrl, {
    method: "GET",
    headers: {
      "User-Agent": "aharadar/0.x (youtube connector)",
      Accept: "application/atom+xml, application/xml, text/xml, */*",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `YouTube feed fetch failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`,
    );
  }

  return res.text();
}

// --- Main Fetch ---

export async function fetchYoutube(params: FetchParams): Promise<FetchResult> {
  const config = parseYoutubeSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const xmlText = await fetchYoutubeFeedXml(config.channelId);
  const { entries, feedChannelId } = parseYoutubeFeed(xmlText);

  const lastPublishedAt = cursorIn.last_published_at ? new Date(cursorIn.last_published_at) : null;
  const recentVideoIdsSet = new Set(cursorIn.recent_video_ids ?? []);

  const rawItems: YoutubeRawEntry[] = [];
  let newestPublished: Date | null = null;
  const newVideoIds: string[] = [];

  for (const entry of entries) {
    if (rawItems.length >= config.maxVideoCount) break;

    // Cursoring: skip entries we've already seen
    // 1) If we've seen this video ID, skip
    if (recentVideoIdsSet.has(entry.videoId)) continue;

    // 2) If entry has a published date older than last_published_at, skip
    const entryDate = entry.published ? new Date(entry.published) : null;
    if (lastPublishedAt && entryDate && entryDate <= lastPublishedAt) {
      continue;
    }

    // Track newest published date
    if (entryDate && (!newestPublished || entryDate > newestPublished)) {
      newestPublished = entryDate;
    }

    // Track video ID for cursor
    newVideoIds.push(entry.videoId);

    // Build canonical URL
    const canonicalUrl = entry.link ?? `https://www.youtube.com/watch?v=${entry.videoId}`;

    // Build raw item
    const rawEntry: YoutubeRawEntry = {
      video_id: entry.videoId,
      channel_id: entry.channelId ?? feedChannelId ?? config.channelId,
      title: entry.title,
      description: entry.description,
      author: entry.author,
      published_at: entryDate?.toISOString() ?? null,
      updated_at: entry.updated ? new Date(entry.updated).toISOString() : null,
      thumbnail_url: entry.thumbnailUrl,
      canonical_url: canonicalUrl,
    };

    rawItems.push(rawEntry);
  }

  // Build next cursor
  const nextCursor: YoutubeCursorJson = {};

  // Update last_published_at to the newest we saw (or keep existing if none)
  if (newestPublished) {
    nextCursor.last_published_at = newestPublished.toISOString();
  } else if (cursorIn.last_published_at) {
    nextCursor.last_published_at = cursorIn.last_published_at;
  }

  // Combine old video IDs with new, keeping most recent first, capped at 100
  const combinedIds = [...newVideoIds, ...(cursorIn.recent_video_ids ?? [])];
  const uniqueIds: string[] = [];
  const seenIds = new Set<string>();
  for (const id of combinedIds) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      uniqueIds.push(id);
      if (uniqueIds.length >= 100) break;
    }
  }
  if (uniqueIds.length > 0) {
    nextCursor.recent_video_ids = uniqueIds;
  }

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      channel_id: config.channelId,
      entries_found: entries.length,
      entries_after_cursor: rawItems.length,
      include_transcript: config.includeTranscript,
    },
  };
}
