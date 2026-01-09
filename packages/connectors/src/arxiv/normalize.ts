import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

import type { RssRawEntry } from "../rss/fetch";

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
 */
function stripHtml(html: string): string {
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

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n+/g, "\n\n");

  return text.trim();
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract arXiv ID from link URL.
 * Examples:
 * - https://arxiv.org/abs/2401.12345 -> 2401.12345
 * - http://arxiv.org/abs/cs/0612047 -> cs/0612047
 * - https://arxiv.org/abs/2401.12345v2 -> 2401.12345v2
 */
function extractArxivId(link: string | null): string | null {
  if (!link) return null;

  // Match /abs/XXXXX or /pdf/XXXXX pattern
  const match = link.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)/i);
  if (match) {
    return match[1].replace(/\.pdf$/, ""); // Remove .pdf suffix if present
  }

  return null;
}

/**
 * Convert arXiv abstract link to PDF URL.
 * https://arxiv.org/abs/2401.12345 -> https://arxiv.org/pdf/2401.12345.pdf
 */
function arxivLinkToPdfUrl(link: string | null): string | null {
  if (!link) return null;

  const arxivId = extractArxivId(link);
  if (arxivId) {
    return `https://arxiv.org/pdf/${arxivId}.pdf`;
  }

  return null;
}

/**
 * Parse authors from dc:creator field.
 * arXiv RSS uses format like: "Author One, Author Two, Author Three"
 * or sometimes "<a href="...">Author One</a>, <a href="...">Author Two</a>"
 */
function parseAuthors(authorRaw: string | null): string[] {
  if (!authorRaw) return [];

  // Strip any HTML tags first
  const plainText = stripHtml(authorRaw);

  // Split by comma and clean up
  return plainText
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

export async function normalizeArxiv(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from RssRawEntry shape
  const guid = asString(rec.guid);
  const link = asString(rec.link);
  const title = asString(rec.title);
  const authorRaw = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const contentHtml = asString(rec.content_html);
  const contentText = asString(rec.content_text);
  const categories = asStringArray(rec.categories);
  const feedUrl = asString(rec.feed_url);

  // Extract arXiv-specific fields
  const arxivId = extractArxivId(link);
  const pdfUrl = arxivLinkToPdfUrl(link);
  const authors = parseAuthors(authorRaw);

  // Use arXiv ID as external ID (more stable than GUID)
  const externalId = arxivId ?? guid;

  // Canonical URL: the abstract page link
  const canonicalUrl = link;

  // Abstract from description/content
  let abstract: string | null = null;
  if (contentText) {
    abstract = stripHtml(contentText);
  } else if (contentHtml) {
    abstract = stripHtml(contentHtml);
  }

  // Body text is the abstract
  let bodyText = abstract;
  if (bodyText) {
    bodyText = clampText(bodyText, 50_000);
    if (bodyText.length === 0) bodyText = null;
  }

  // Clean title (arXiv titles sometimes have extra whitespace)
  let cleanTitle = title;
  if (cleanTitle) {
    cleanTitle = cleanTitle.replace(/\s+/g, " ").trim();
  }

  // Build metadata with arXiv-specific fields
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (categories.length > 0) metadata.categories = categories;
  if (arxivId) metadata.arxiv_id = arxivId;
  if (pdfUrl) metadata.pdf_url = pdfUrl;
  if (authors.length > 0) metadata.authors = authors;
  if (abstract) metadata.abstract = clampText(abstract, 10_000);
  if (guid) metadata.guid = guid;

  // Build raw for debugging (bounded)
  const rawData: RssRawEntry = {
    guid,
    link,
    title,
    author: authorRaw,
    published_at: publishedAt,
    content_html: contentHtml ? clampText(contentHtml, 10_000) : null,
    content_text: contentText ? clampText(contentText, 10_000) : null,
    categories,
    feed_url: feedUrl ?? "",
  };

  return {
    title: cleanTitle,
    bodyText,
    canonicalUrl,
    sourceType: "arxiv",
    externalId,
    publishedAt,
    author: authors.length > 0 ? authors.join(", ") : authorRaw,
    metadata,
    raw: rawData,
  };
}
