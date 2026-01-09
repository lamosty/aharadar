import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

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

function toIsoFromSeconds(value: unknown): string | null {
  const s = asNumber(value);
  if (s === null) return null;
  const d = new Date(s * 1000);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function ensureRedditPermalink(permalink: string | null): string | null {
  if (!permalink) return null;
  if (permalink.startsWith("http://") || permalink.startsWith("https://")) return permalink;
  if (!permalink.startsWith("/")) return `https://www.reddit.com/${permalink}`;
  return `https://www.reddit.com${permalink}`;
}

export async function normalizeReddit(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const post = asRecord(raw);

  const title = asString(post.title);
  const selftext = asString(post.selftext);
  const isSelf = post.is_self === true;
  const url = asString(post.url);
  const permalink = ensureRedditPermalink(asString(post.permalink));

  const canonicalUrl = isSelf ? permalink : (url ?? permalink);

  const externalId = asString(post.name) ?? (asString(post.id) ? `t3_${asString(post.id)}` : null);
  const publishedAt = toIsoFromSeconds(post.created_utc);
  const author = asString(post.author);

  const topComments = Array.isArray(post._top_comments)
    ? (post._top_comments as unknown[])
        .filter((c) => typeof c === "string" && c.trim().length > 0)
        .slice(0, 50)
    : [];

  const commentsText =
    topComments.length > 0
      ? `\n\nTop comments:\n- ${topComments.map((c) => String(c).replaceAll("\n", " ")).join("\n- ")}`
      : "";
  const bodyText =
    (selftext ?? "").trim().length > 0
      ? `${selftext}${commentsText}`
      : commentsText.trim().length > 0
        ? commentsText.trim()
        : null;

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "reddit",
    externalId,
    publishedAt,
    author,
    metadata: {
      subreddit: asString(post.subreddit),
      subreddit_id: asString(post.subreddit_id),
      score: asNumber(post.score),
      ups: asNumber(post.ups),
      num_comments: asNumber(post.num_comments),
      permalink,
      url,
      domain: asString(post.domain),
      is_self: isSelf,
      over_18: post.over_18 === true,
      spoiler: post.spoiler === true,
      stickied: post.stickied === true,
      locked: post.locked === true,
      upvote_ratio: asNumber(post.upvote_ratio),
      link_flair_text: asString(post.link_flair_text),
    },
    raw: post,
  };
}
