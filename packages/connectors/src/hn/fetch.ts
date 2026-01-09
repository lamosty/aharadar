import type { FetchParams, FetchResult } from "@aharadar/shared";

import { parseHnSourceConfig } from "./config";

// HN Firebase API base URL
const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

// Cursor shape for HN
interface HnCursorJson {
  last_run_at?: string; // ISO timestamp
}

// HN item shape (story)
export interface HnRawItem {
  id: number;
  type: string; // "story", "job", "poll", etc.
  by: string | null;
  time: number | null; // unix seconds
  title: string | null;
  text: string | null; // HTML content for text posts
  url: string | null;
  score: number | null;
  descendants: number | null; // comment count
}

// --- Helpers ---

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCursor(cursor: Record<string, unknown>): HnCursorJson {
  const lastRunAt = asString(cursor.last_run_at);
  return { last_run_at: lastRunAt ?? undefined };
}

// --- HTTP Fetch ---

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "aharadar/0.x (hn connector)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HN API fetch failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`);
  }

  return res.json() as Promise<T>;
}

// --- Fetch Story IDs ---

async function fetchStoryIds(feed: "top" | "new"): Promise<number[]> {
  const feedName = feed === "top" ? "topstories" : "newstories";
  const url = `${HN_API_BASE}/${feedName}.json`;
  const ids = await fetchJson<unknown>(url);

  if (!Array.isArray(ids)) {
    throw new Error(`HN API returned unexpected format for ${feedName}`);
  }

  return ids.filter((id): id is number => typeof id === "number");
}

// --- Fetch Single Item ---

async function fetchItem(id: number): Promise<HnRawItem | null> {
  const url = `${HN_API_BASE}/item/${id}.json`;
  const data = await fetchJson<unknown>(url);

  if (!data || typeof data !== "object") return null;

  const rec = asRecord(data);

  // Only process stories (not jobs, polls, etc. for now)
  const type = typeof rec.type === "string" ? rec.type : "unknown";

  return {
    id: typeof rec.id === "number" ? rec.id : id,
    type,
    by: typeof rec.by === "string" ? rec.by : null,
    time: typeof rec.time === "number" ? rec.time : null,
    title: typeof rec.title === "string" ? rec.title : null,
    text: typeof rec.text === "string" ? rec.text : null,
    url: typeof rec.url === "string" ? rec.url : null,
    score: typeof rec.score === "number" ? rec.score : null,
    descendants: typeof rec.descendants === "number" ? rec.descendants : null,
  };
}

// --- Concurrent Fetch with Limit ---

async function fetchItemsConcurrent(ids: number[], concurrency: number): Promise<HnRawItem[]> {
  const results: HnRawItem[] = [];

  // Process in batches
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          return await fetchItem(id);
        } catch {
          // If a single item fails, continue with others
          return null;
        }
      }),
    );

    for (const item of batchResults) {
      if (item && item.type === "story") {
        results.push(item);
      }
    }
  }

  return results;
}

// --- Main Fetch ---

export async function fetchHn(params: FetchParams): Promise<FetchResult> {
  const config = parseHnSourceConfig(params.config);
  const _cursorIn = parseCursor(params.cursor);

  // Fetch story IDs from the configured feed
  const storyIds = await fetchStoryIds(config.feed);

  // Limit to maxItems
  const maxItems = Math.max(0, Math.floor(params.limits.maxItems));
  const idsToFetch = storyIds.slice(0, maxItems);

  // Fetch items with concurrency limit (10 concurrent requests)
  const rawItems = await fetchItemsConcurrent(idsToFetch, 10);

  // Build next cursor
  const nextCursor: HnCursorJson = {
    last_run_at: params.windowEnd,
  };

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      feed: config.feed,
      story_ids_available: storyIds.length,
      story_ids_requested: idsToFetch.length,
      stories_fetched: rawItems.length,
    },
  };
}
