import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { sha256Hex } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function extractOpenAIContent(response: unknown): string | null {
  const rec = asRecord(response);
  const choices = rec.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = asRecord(choices[0]);
  const msg = asRecord(first.message);
  return asString(msg.content);
}

function extractResultsObject(response: unknown): Record<string, unknown> | null {
  // If provider returned an OpenAI-style response, content may be a JSON string.
  const content = extractOpenAIContent(response);
  if (content) {
    const obj = tryParseJsonObject(content);
    if (obj) return obj;
  }

  // Otherwise, treat response itself as a JSON object.
  const rec = asRecord(response);
  return Object.keys(rec).length > 0 ? rec : null;
}

function extractSnippets(resultsObj: Record<string, unknown>): string[] {
  const out: string[] = [];
  const results = resultsObj.results;
  if (Array.isArray(results)) {
    for (const entry of results) {
      const r = asRecord(entry);
      const text = asString(r.text);
      if (text) out.push(text);
      if (out.length >= 5) break;
    }
  }
  return out;
}

function looksLikeUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function extractUrls(resultsObj: Record<string, unknown>): string[] {
  const out: string[] = [];
  const results = resultsObj.results;
  if (!Array.isArray(results)) return out;

  for (const entry of results) {
    const r = asRecord(entry);
    const urls = r.urls;
    if (Array.isArray(urls)) {
      for (const u of urls) {
        const s = asString(u);
        if (s && looksLikeUrl(s)) out.push(s);
        if (out.length >= 20) return out;
      }
    }
  }
  return out;
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export async function normalizeSignal(raw: unknown, params: FetchParams): Promise<ContentItemDraft> {
  const rec = asRecord(raw);
  const query = asString(rec.query) ?? "signal";
  const provider = asString(rec.provider) ?? "x_search";
  const vendor = asString(rec.vendor) ?? "grok";

  const response = rec.response;
  const resultsObj = extractResultsObject(response);
  const snippets = resultsObj ? extractSnippets(resultsObj) : [];
  const urls = resultsObj ? extractUrls(resultsObj) : [];

  const title = `Signal: ${query}`;
  const bodyText =
    snippets.length > 0
      ? clampText(snippets.map((s) => `- ${s.replaceAll("\n", " ").trim()}`).join("\n"), 10_000)
      : null;

  // Deterministic: one item per (query, day-bucket).
  const dayBucket = params.windowStart.slice(0, 10); // YYYY-MM-DD
  const externalId = sha256Hex([provider, vendor, query, dayBucket].join("|"));

  return {
    title,
    bodyText,
    // Signals are "amplifiers" (not canonical content). Keep canonical_url null and store URLs in metadata.
    canonicalUrl: null,
    sourceType: "signal",
    externalId,
    publishedAt: null,
    author: null,
    metadata: {
      provider,
      vendor,
      query,
      result_count: resultsObj && Array.isArray(resultsObj.results) ? resultsObj.results.length : null,
      primary_url: urls[0] ?? null,
      extracted_urls: urls
    },
    raw: {
      kind: asString(rec.kind),
      query,
      provider,
      vendor,
      response
    }
  };
}


