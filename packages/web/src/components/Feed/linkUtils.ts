interface ClusterLinkItem {
  sourceType: string;
  url: string | null;
}

interface PrimaryLinkUrlInput {
  sourceType: string;
  originalUrl: string | null | undefined;
  author?: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  clusterItems?: ReadonlyArray<ClusterLinkItem>;
}

export function isLikelyUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normalizeXHandle(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noPrefix = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(noPrefix)) return null;
  return noPrefix;
}

export function getXProfileUrl(
  author: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const fromAuthor = normalizeXHandle(author);
  if (fromAuthor) return `https://x.com/${fromAuthor}`;

  const rawMetadataHandle =
    typeof metadata?.user_handle === "string"
      ? metadata.user_handle
      : typeof metadata?.handle === "string"
        ? metadata.handle
        : null;
  const fromMetadata = normalizeXHandle(rawMetadataHandle);
  if (fromMetadata) return `https://x.com/${fromMetadata}`;

  return null;
}

/**
 * Resolve the click target URL for a feed row.
 * Falls back from canonical URL to metadata URLs and cluster member URLs.
 */
export function getPrimaryLinkUrl({
  sourceType,
  originalUrl,
  author,
  metadata,
  clusterItems,
}: PrimaryLinkUrlInput): string | null {
  const permalink = metadata?.permalink;
  if (sourceType === "reddit" && typeof permalink === "string" && permalink.length > 0) {
    if (permalink.startsWith("http")) return permalink;
    return permalink.startsWith("/")
      ? `https://www.reddit.com${permalink}`
      : `https://www.reddit.com/${permalink}`;
  }

  if (isLikelyUrl(originalUrl)) {
    return originalUrl;
  }

  if (isLikelyUrl(metadata?.primary_url)) {
    return metadata.primary_url;
  }
  if (isLikelyUrl(metadata?.post_url)) {
    return metadata.post_url;
  }
  if (isLikelyUrl(metadata?.url)) {
    return metadata.url;
  }

  if (Array.isArray(metadata?.extracted_urls)) {
    const firstExtractedUrl = metadata.extracted_urls.find(isLikelyUrl);
    if (firstExtractedUrl) {
      return firstExtractedUrl;
    }
  }

  if (clusterItems?.length) {
    const sameSourceUrl = clusterItems.find(
      (clusterItem) => clusterItem.sourceType === sourceType && isLikelyUrl(clusterItem.url),
    )?.url;
    if (sameSourceUrl) {
      return sameSourceUrl;
    }

    const anyClusterUrl = clusterItems.find((clusterItem) => isLikelyUrl(clusterItem.url))?.url;
    if (anyClusterUrl) {
      return anyClusterUrl;
    }
  }

  if (sourceType === "x_posts") {
    return getXProfileUrl(author, metadata);
  }

  return null;
}
