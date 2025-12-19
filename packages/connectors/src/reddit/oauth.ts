type RedditOAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type RedditRateLimitSnapshot = {
  used: number | null;
  remaining: number | null;
  resetSeconds: number | null;
};

let cachedToken: string | null = null;
let cachedTokenExpiresAtMs = 0;

let lastRateLimit: RedditRateLimitSnapshot | null = null;
let lastRateLimitResetAtMs: number | null = null;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function base64Encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function getEnvOrNull(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getRedditUserAgent(): string {
  return getEnvOrNull("REDDIT_USER_AGENT") ?? "aharadar/0.x (mvp; connectors/reddit)";
}

function getRedditClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = getEnvOrNull("REDDIT_CLIENT_ID");
  // For some Reddit app types, secret may be empty; treat missing as empty string.
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? "";

  if (!clientId) {
    throw new Error(
      'Missing Reddit OAuth env. Set REDDIT_CLIENT_ID (and optionally REDDIT_CLIENT_SECRET) to use the supported OAuth Data API.'
    );
  }
  return { clientId, clientSecret };
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRateLimitHeaders(headers: Headers): RedditRateLimitSnapshot {
  // Reddit uses these headers (when present): X-Ratelimit-Used, X-Ratelimit-Remaining, X-Ratelimit-Reset (seconds).
  // Be tolerant: some responses may omit them.
  const used = asNumber(Number.parseFloat(headers.get("x-ratelimit-used") ?? "")) ?? null;
  const remaining = asNumber(Number.parseFloat(headers.get("x-ratelimit-remaining") ?? "")) ?? null;
  const resetSeconds = asNumber(Number.parseFloat(headers.get("x-ratelimit-reset") ?? "")) ?? null;
  return { used, remaining, resetSeconds };
}

function updateRateLimitState(headers: Headers): void {
  const snapshot = parseRateLimitHeaders(headers);
  if (snapshot.used !== null || snapshot.remaining !== null || snapshot.resetSeconds !== null) {
    lastRateLimit = snapshot;
    lastRateLimitResetAtMs =
      snapshot.resetSeconds !== null ? Date.now() + Math.max(0, snapshot.resetSeconds) * 1000 : null;
  }
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function maybeWaitForRateLimit(): Promise<void> {
  if (!lastRateLimit) return;
  if (lastRateLimit.remaining === null) return;
  if (lastRateLimit.remaining >= 1) return;
  if (!lastRateLimitResetAtMs) return;

  const now = Date.now();
  const waitMs = lastRateLimitResetAtMs - now;
  // Keep waits bounded; this is an MVP CLI and we don't want surprise multi-minute stalls.
  const maxWaitMs = 60_000;
  if (waitMs > 0 && waitMs <= maxWaitMs) {
    await sleepMs(waitMs + 250);
  }
}

async function fetchOAuthToken(): Promise<{ token: string; expiresAtMs: number; scope: string | null }> {
  const { clientId, clientSecret } = getRedditClientCreds();
  const userAgent = getRedditUserAgent();

  const endpoint = "https://www.reddit.com/api/v1/access_token";
  const body = new URLSearchParams();
  // App-only token for read-only public data access.
  body.set("grant_type", "client_credentials");

  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${base64Encode(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent,
      accept: "application/json",
    },
    body: body.toString(),
  });
  const endedAt = Date.now();

  const contentType = res.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const snippet = typeof payload === "string" ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500);
    throw new Error(`Reddit OAuth token fetch failed (${res.status}) after ${endedAt - startedAt}ms: ${snippet}`);
  }

  const obj = payload as RedditOAuthTokenResponse;
  const token = asString(obj.access_token);
  const expiresIn = asNumber(obj.expires_in);
  const scope = asString(obj.scope);
  if (!token || !expiresIn) {
    throw new Error(`Reddit OAuth token response missing access_token/expires_in: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  // Refresh a bit early to avoid edge-of-expiry 401s.
  const bufferSeconds = 30;
  const expiresAtMs = Date.now() + Math.max(0, expiresIn - bufferSeconds) * 1000;
  return { token, expiresAtMs, scope };
}

async function getOAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiresAtMs) return cachedToken;
  const { token, expiresAtMs } = await fetchOAuthToken();
  cachedToken = token;
  cachedTokenExpiresAtMs = expiresAtMs;
  return token;
}

export function getLastRedditRateLimit(): RedditRateLimitSnapshot | null {
  return lastRateLimit;
}

export function clearRedditOAuthTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiresAtMs = 0;
}

export async function redditFetchJson(url: string): Promise<unknown> {
  const userAgent = getRedditUserAgent();

  // Respect any known near-term rate limits before making the call.
  await maybeWaitForRateLimit();

  const token = await getOAuthToken();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  updateRateLimitState(res.headers);

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  // If we got a 401, the token may have expired/been revoked. Retry once with a fresh token.
  if (res.status === 401) {
    clearRedditOAuthTokenCache();
    const retryToken = await getOAuthToken();
    const retry = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${retryToken}`,
        "user-agent": userAgent,
        accept: "application/json",
      },
    });
    updateRateLimitState(retry.headers);
    const retryContentType = retry.headers.get("content-type") ?? "";
    const retryBody = retryContentType.includes("application/json") ? await retry.json() : await retry.text();
    if (!retry.ok) {
      const snippet =
        typeof retryBody === "string" ? retryBody.slice(0, 500) : JSON.stringify(retryBody).slice(0, 500);
      throw new Error(`Reddit API failed (${retry.status} ${retry.statusText}) after token refresh: ${snippet}`);
    }
    return retryBody;
  }

  if (res.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));
    if (retryAfterSeconds !== null && retryAfterSeconds <= 60) {
      await sleepMs(retryAfterSeconds * 1000 + 250);
      return redditFetchJson(url);
    }
  }

  if (!res.ok) {
    const snippet = typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500);
    const rl = lastRateLimit ? ` rate_limit=${JSON.stringify(lastRateLimit)}` : "";
    throw new Error(`Reddit API failed (${res.status} ${res.statusText}): ${snippet}${rl}`);
  }

  return body;
}
