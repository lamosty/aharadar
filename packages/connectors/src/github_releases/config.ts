/**
 * GitHub Releases connector config.
 *
 * Wraps RSS/Atom for GitHub releases.
 * Accepts owner and repo, constructs the releases Atom feed URL.
 */
export interface GithubReleasesSourceConfig {
  owner: string;
  repo: string;
  feedUrl: string; // computed from owner/repo
  maxItemCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

export function parseGithubReleasesSourceConfig(
  config: Record<string, unknown>,
): GithubReleasesSourceConfig {
  const owner = asString(config.owner);
  const repo = asString(config.repo);

  if (!owner) {
    throw new Error('GitHub Releases source config must include non-empty "owner"');
  }
  if (!repo) {
    throw new Error('GitHub Releases source config must include non-empty "repo"');
  }

  // Construct the GitHub releases Atom feed URL
  const feedUrl = `https://github.com/${owner}/${repo}/releases.atom`;

  const maxRaw = config.max_item_count ?? config.maxItemCount;
  const maxItemCount = Math.max(1, Math.min(200, asNumber(maxRaw, 50)));

  return {
    owner,
    repo,
    feedUrl,
    maxItemCount,
  };
}
