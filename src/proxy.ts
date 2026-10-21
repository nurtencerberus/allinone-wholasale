import { NextResponse, type NextRequest } from "next/server";

/**
 * KYT-6: a cross-site form must not be able to act on someone's session.
 *
 * Session cookies are SameSite=Lax, which already blocks a cross-site POST from carrying them —
 * but Lax is a browser behaviour, not a server rule, and a form posting `text/plain` has
 * historically slipped past similar defences. This is the server rule: every state-changing
 * request to /api must come from our own origin and carry a real API content type.
 *
 * Deliberately narrow. It does not authenticate, authorise or touch pages — each route still
 * does its own `requireStaff` / `getSessionUser` check, which is where the real access control
 * lives (see CLAUDE.md: there is no auth middleware, and this does not become one).
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_TYPES = ["application/json", "multipart/form-data", "application/x-www-form-urlencoded"];

/** Server-to-server callers that sign their own requests and send no Origin. */
const SIGNED_CALLERS = ["/api/stripe/webhook"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/") || !MUTATING.has(request.method)) return NextResponse.next();
  if (SIGNED_CALLERS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === request.nextUrl.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
  }

  // A browser form can only send these three types, and a cross-site form cannot send JSON.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  }
  if (contentType === "application/x-www-form-urlencoded" && !origin) {
    // The one shape a cross-site form can produce without an Origin header.
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
