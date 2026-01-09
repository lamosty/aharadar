import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v): v is string => v !== null);
}

/**
 * Strip HTML tags from content, returning plain text.
 * Best-effort: handles common HTML entities and removes tags.
 */
function stripHtml(html: string): string {
  // Decode common HTML entities
  let text = html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Remove script and style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Collapse multiple whitespace/newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n+/g, "\n\n");

  return text.trim();
}

/**
 * Clamp text to a max character length.
 */
function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract version from title.
 * Matches patterns like: "v1.2.3", "V1.2.3", "Release 1.2.3", "Version 1.2.3"
 */
function extractVersion(title: string | null): string | null {
  if (!title) return null;

  // Pattern 1: "v1.2.3" or "V1.2.3" (with optional leading text)
  const vMatch = title.match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-._][a-zA-Z0-9._-]+)?)\b/i);
  if (vMatch) {
    // If it starts with v/V, include it
    const fullMatch = title.match(/\b(v\d+\.\d+(?:\.\d+)?(?:[-._][a-zA-Z0-9._-]+)?)\b/i);
    if (fullMatch) return fullMatch[1];
    return vMatch[1];
  }

  return null;
}

/**
 * Check if title indicates a prerelease.
 * Matches: alpha, beta, rc, pre, preview, canary, dev, nightly
 */
function isPrerelease(title: string | null): boolean {
  if (!title) return false;
  const lowerTitle = title.toLowerCase();
  return /\b(alpha|beta|rc|pre|preview|canary|dev|nightly)\b/.test(lowerTitle);
}

// Raw entry shape from RSS fetch (matches RssRawEntry)
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

export async function normalizeGithubReleases(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from RssRawEntry shape
  const guid = asString(rec.guid);
  const link = asString(rec.link);
  const title = asString(rec.title);
  const author = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const contentHtml = asString(rec.content_html);
  const contentText = asString(rec.content_text);
  const categories = asStringArray(rec.categories);
  const feedUrl = asString(rec.feed_url);

  // Canonical URL: entry link
  const canonicalUrl = link;

  // External ID: GUID if present
  const externalId = guid;

  // Body text: prefer content over summary, strip HTML to plain text
  let bodyText: string | null = null;
  if (contentHtml) {
    bodyText = stripHtml(contentHtml);
  } else if (contentText) {
    bodyText = stripHtml(contentText);
  }

  // Clamp body text to reasonable length
  if (bodyText) {
    bodyText = clampText(bodyText, 50_000);
    if (bodyText.length === 0) bodyText = null;
  }

  // Extract GitHub releases specific metadata
  const version = extractVersion(title);
  const prerelease = isPrerelease(title);

  // Extract owner/repo from config
  const configRec = asRecord(params.config);
  const owner = asString(configRec.owner);
  const repo = asString(configRec.repo);
  const repoFullName = owner && repo ? `${owner}/${repo}` : null;

  // Build metadata
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (categories.length > 0) metadata.categories = categories;
  if (guid) metadata.guid = guid;
  if (version) metadata.version = version;
  if (prerelease) metadata.prerelease = prerelease;
  if (repoFullName) metadata.repo_full_name = repoFullName;
  // Store release notes separately if present
  if (bodyText) metadata.release_notes = bodyText;

  // Build raw for debugging (bounded)
  const rawData: GithubReleasesRawEntry = {
    guid,
    link,
    title,
    author,
    published_at: publishedAt,
    content_html: contentHtml ? clampText(contentHtml, 10_000) : null,
    content_text: contentText ? clampText(contentText, 10_000) : null,
    categories,
    feed_url: feedUrl ?? "",
  };

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "github_releases",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
