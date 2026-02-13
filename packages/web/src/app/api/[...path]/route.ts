import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function resolveApiOrigin(): string {
  const configured = process.env.API_URL?.trim() || process.env.WEB_INTERNAL_API_URL?.trim();
  if (!configured) {
    throw new Error("Missing API_URL (or WEB_INTERNAL_API_URL) for web API proxy");
  }
  return configured.replace(/\/+$/, "");
}

function buildUpstreamUrl(request: NextRequest): string {
  const origin = resolveApiOrigin();
  const incomingPath = request.nextUrl.pathname;
  const upstreamPath = incomingPath.startsWith("/api")
    ? incomingPath.slice(4) || "/"
    : incomingPath;
  return `${origin}/api${upstreamPath}${request.nextUrl.search}`;
}

function buildUpstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

async function proxy(request: NextRequest): Promise<NextResponse> {
  let upstreamUrl: string;
  try {
    upstreamUrl = buildUpstreamUrl(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid web API proxy configuration";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "WEB_PROXY_CONFIG_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request),
      body,
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "WEB_PROXY_UPSTREAM_UNAVAILABLE",
          message: "API upstream is unavailable",
        },
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}
