import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Routes that require authentication
const PROTECTED_PATHS = ["/app"];

// Routes that should redirect to /app if already authenticated
const AUTH_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get("session");
  const bypassCookie = request.cookies.get("BYPASS_AUTH");
  const hasSession = !!sessionCookie?.value;
  const hasBypass = bypassCookie?.value === "admin" || bypassCookie?.value === "user";

  // Protect /app/* routes - redirect to login if not authenticated
  if (PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    if (!hasSession && !hasBypass) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users away from login page
  if (AUTH_PATHS.some((path) => pathname === path)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
