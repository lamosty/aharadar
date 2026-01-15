import { NextResponse } from "next/server";

/**
 * Dev-only auth bypass endpoint.
 * Sets the BYPASS_AUTH cookie and redirects to /app.
 *
 * Usage: GET /api/dev/bypass?role=admin
 *        GET /api/dev/bypass?role=user
 *        GET /api/dev/bypass?role=clear (removes bypass)
 */
export async function GET(request: Request) {
  // Only available in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role") || "admin";
  const email = url.searchParams.get("email");
  const redirectPath = url.searchParams.get("redirect") || "/app";

  // Use Host header to preserve the actual IP/hostname the client used
  // (request.url uses the server's bound address which may be 0.0.0.0)
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const redirectUrl = host
    ? `${protocol}://${host}${redirectPath}`
    : new URL(redirectPath, request.url).toString();

  const response = NextResponse.redirect(redirectUrl);

  if (role === "clear") {
    // Clear the bypass cookies
    response.cookies.set("BYPASS_AUTH", "", {
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("BYPASS_EMAIL", "", {
      path: "/",
      maxAge: 0,
    });
  } else if (role === "admin" || role === "user") {
    // Set bypass cookie
    response.cookies.set("BYPASS_AUTH", role, {
      path: "/",
      sameSite: "lax",
      secure: false,
      httpOnly: false, // Needs to be readable by AuthProvider
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    // Set email cookie if provided
    if (email) {
      response.cookies.set("BYPASS_EMAIL", email, {
        path: "/",
        sameSite: "lax",
        secure: false,
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }
  } else {
    return NextResponse.json(
      { error: "Invalid role. Use: admin, user, or clear" },
      { status: 400 },
    );
  }

  return response;
}
