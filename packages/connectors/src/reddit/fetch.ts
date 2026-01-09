import type { FetchParams, FetchResult } from "@aharadar/shared";

import { parseRedditSourceConfig } from "./config";

type RedditCursorJson = {
  last_seen_created_utc?: number;
};

type RedditListingResponse = {
  kind?: string;
  data?: {
    after?: string | null;
    children?: Array<{ kind?: string; data?: Record<string, unknown> }>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCursor(cursor: Record<string, unknown>): RedditCursorJson {
  const lastSeen = asNumber(cursor.last_seen_created_utc);
  return lastSeen ? { last_seen_created_utc: lastSeen } : {};
}

function buildListingUrl(params: {
  subreddit: string;
  listing: "new" | "top" | "hot";
  limit: number;
  after: string | null;
  timeFilter: "hour" | "day" | "week" | "month" | "year" | "all";
}): string {
  const base = `https://www.reddit.com/r/${encodeURIComponent(params.subreddit)}/${params.listing}.json`;
  const url = new URL(base);
  url.searchParams.set("raw_json", "1");
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, params.limit))));
  if (params.after) url.searchParams.set("after", params.after);
  if (params.listing === "top") url.searchParams.set("t", params.timeFilter);
  return url.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      // Reddit strongly prefers an explicit UA for API-like access.
      "user-agent": "aharadar/0.x (mvp; connectors/reddit)",
      accept: "application/json",
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail =
      typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500);
    throw new Error(`Reddit fetch failed (${res.status} ${res.statusText}): ${detail}`);
  }
  return body;
}

async function fetchTopComments(params: {
  permalink: string;
  maxCommentCount: number;
}): Promise<string[]> {
  const base = `https://www.reddit.com${params.permalink}.json`;
  const url = new URL(base);
  url.searchParams.set("raw_json", "1");
  url.searchParams.set("limit", String(Math.max(1, Math.min(50, params.maxCommentCount))));
  url.searchParams.set("depth", "1");

  const payload = await fetchJson(url.toString());
  if (!Array.isArray(payload) || payload.length < 2) return [];
  const commentsListing = payload[1] as Record<string, unknown>;
  const data = asRecord(commentsListing.data);
  const children = Array.isArray(data.children) ? (data.children as unknown[]) : [];
  const out: string[] = [];
  for (const child of children) {
    const c = asRecord(child);
    const kind = asString(c.kind);
    if (kind !== "t1") continue;
    const cd = asRecord(c.data);
    const body = asString(cd.body);
    if (body) out.push(body);
    if (out.length >= params.maxCommentCount) break;
  }
  return out;
}

export async function fetchReddit(params: FetchParams): Promise<FetchResult> {
  const config = parseRedditSourceConfig(params.config);
  if (!config.subreddit) {
    throw new Error('Reddit source config must include non-empty "subreddit" string');
  }

  const cursorIn = parseCursor(params.cursor);
  const lastSeen = cursorIn.last_seen_created_utc ?? 0;
  let newestSeen = lastSeen;

  const rawItems: unknown[] = [];
  const maxItems = Math.max(0, Math.floor(params.limits.maxItems));

  // For non-incremental listings (top/hot), we still fetch but don't advance cursor.
  const isIncremental = config.listing === "new";

  let httpRequests = 0;
  let after: string | null = null;
  let done = false;

  // Page until we hit lastSeen (incremental) or we fill maxItems.
  for (let page = 0; page < 10; page += 1) {
    if (rawItems.length >= maxItems) break;
    if (done) break;

    const url = buildListingUrl({
      subreddit: config.subreddit,
      listing: config.listing ?? "new",
      timeFilter: config.timeFilter ?? "day",
      after,
      limit: Math.min(100, maxItems - rawItems.length),
    });

    const payload = (await fetchJson(url)) as RedditListingResponse;
    httpRequests += 1;

    const children = payload?.data?.children ?? [];
    if (children.length === 0) break;

    for (const child of children) {
      if (rawItems.length >= maxItems) break;
      const data = child?.data ?? {};
      const createdUtc = asNumber(data.created_utc);

      if (isIncremental && createdUtc !== null && createdUtc <= lastSeen) {
        done = true;
        break;
      }

      if (createdUtc !== null && createdUtc > newestSeen) newestSeen = createdUtc;
      rawItems.push(data);
    }

    after = payload?.data?.after ? String(payload.data.after) : null;
    if (!after) break;
  }

  // Build next cursor
  const nextCursor: RedditCursorJson = isIncremental ? { last_seen_created_utc: newestSeen } : {};

  // Optional: enrich with top comments (extra HTTP calls) for better embedding signal.
  if (config.includeComments && config.maxCommentCount && config.maxCommentCount > 0) {
    for (let i = 0; i < rawItems.length; i += 1) {
      const item = rawItems[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const post = item as Record<string, unknown>;
      const permalink = asString(post.permalink);
      if (!permalink) continue;
      const comments = await fetchTopComments({
        permalink,
        maxCommentCount: config.maxCommentCount,
      });
      httpRequests += 1;
      post._top_comments = comments;
    }
  }

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      requests: httpRequests,
      listing: config.listing ?? "new",
      subreddit: config.subreddit,
      incremental: isIncremental,
    },
  };
}
