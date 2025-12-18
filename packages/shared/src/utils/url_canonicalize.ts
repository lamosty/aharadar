// Topic-agnostic URL canonicalization helper.
//
// Contract (see docs):
// - normalize scheme/host
// - strip common tracking params (utm_*, fbclid, gclid, etc.)
// - normalize trailing slashes
// - keep essential query params when they define identity (TBD allowlist)
//
// This is intentionally conservative for the scaffold; we’ll refine as we implement ingestion.

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

export function canonicalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // Remove tracking params
  const toDelete: string[] = [];
  url.searchParams.forEach((_, key) => {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) toDelete.push(key);
    if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) toDelete.push(key);
  });
  for (const key of toDelete) url.searchParams.delete(key);

  // Normalize trailing slash
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
