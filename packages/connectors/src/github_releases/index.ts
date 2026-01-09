import type { FetchParams, FetchResult } from "@aharadar/shared";

import { parseFeed } from "../rss/fetch";
import type { Connector } from "../types";
import { parseGithubReleasesSourceConfig } from "./config";
import { normalizeGithubReleases } from "./normalize";

// Cursor shape for GitHub releases (reuses RSS cursor pattern)
interface GithubReleasesCursorJson {
  last_published_at?: string;
  recent_guids?: string[];
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value.trim();
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter((v): v is string => v !== null);
  }
  return [];
}

function parseCursor(cursor: Record<string, unknown>): GithubReleasesCursorJson {
  const lastPublished = asString(cursor.last_published_at);
  const recentGuids = asStringArray(cursor.recent_guids);
  return {
    last_published_at: lastPublished ?? undefined,
    recent_guids: recentGuids.length > 0 ? recentGuids : undefined,
  };
}

// Raw entry shape matching RSS
interface GithubReleasesRawEntry {
  guid: string | null;
  link: string | null;
  title: string | null;
  author: string | null;
  published_at: string | null;
  content_html: string | null;
  content_text: string | null;
  categories: string[];
  feed_url: string;
}

async function fetchFeedXml(feedUrl: string): Promise<string> {
  const res = await fetch(feedUrl, {
    method: "GET",
    headers: {
      "User-Agent": "aharadar/0.x (github_releases connector)",
      Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub releases fetch failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`,
    );
  }

  return res.text();
}

async function fetchGithubReleases(params: FetchParams): Promise<FetchResult> {
  const config = parseGithubReleasesSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const xmlText = await fetchFeedXml(config.feedUrl);
  const parsed = parseFeed(xmlText);

  const lastPublishedAt = cursorIn.last_published_at ? new Date(cursorIn.last_published_at) : null;
  const recentGuidsSet = new Set(cursorIn.recent_guids ?? []);

  const rawItems: GithubReleasesRawEntry[] = [];
  let newestPublished: Date | null = null;
  const newGuids: string[] = [];

  for (const entry of parsed.entries) {
    if (rawItems.length >= config.maxItemCount) break;

    // Cursoring: skip entries we've already seen
    if (entry.guid && recentGuidsSet.has(entry.guid)) continue;

    const entryDate = entry.published ? new Date(entry.published) : null;
    if (lastPublishedAt && entryDate && entryDate <= lastPublishedAt) {
      if (!entry.guid) continue;
    }

    // Track newest published date
    if (entryDate && (!newestPublished || entryDate > newestPublished)) {
      newestPublished = entryDate;
    }

    // Track GUID for cursor
    if (entry.guid) newGuids.push(entry.guid);

    // Build raw item - prefer content for release notes
    const contentHtml = entry.contentHtml ?? entry.summary;
    const contentText = entry.summary;

    const rawEntry: GithubReleasesRawEntry = {
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
  const nextCursor: GithubReleasesCursorJson = {};

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
      owner: config.owner,
      repo: config.repo,
    },
  };
}

export const githubReleasesConnector: Connector = {
  sourceType: "github_releases",
  fetch: fetchGithubReleases,
  normalize: normalizeGithubReleases,
};
