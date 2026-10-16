/**
 * Root Next.js middleware. Sets defensive security headers on every `/api/*`
 * response so JSON endpoints can never be coerced into rendering HTML, loading
 * subresources, or being framed by a third party.
 *
 *   Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
 *   X-Content-Type-Options: nosniff
 *
 * Better-auth lives at `/api/auth/*` and returns JSON, so the same locked-down
 * CSP is safe. Invite URLs are checked before Next parses Server Action bodies.
 */

import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse {
    const path = request.nextUrl.pathname;
    if (path === "/invite" || path.startsWith("/invite/")) {
        // BUR-96: issued tokens are 24 random bytes encoded as hex. Reject fake
        // paths before malformed multipart bodies reach Next's action parser.
        try {
            if (/^\/invite\/[0-9a-f]{48}\/?$/i.test(decodeURIComponent(path))) {
                return NextResponse.next();
            }
        } catch {
            // Invalid URL encoding is also a malformed invitation link.
        }
        return new NextResponse(null, { status: 404 });
    }
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
}

export const config = {
    matcher: ["/api/(.*)", "/invite/:path*"],
};
