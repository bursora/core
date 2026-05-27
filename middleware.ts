/**
 * Root Next.js middleware. Sets defensive security headers on every `/api/*`
 * response so JSON endpoints can never be coerced into rendering HTML, loading
 * subresources, or being framed by a third party.
 *
 *   Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
 *   X-Content-Type-Options: nosniff
 *
 * Scope is locked to `/api/(.*)` via `config.matcher`. Better-auth lives at
 * `/api/auth/*` and returns JSON, so the same locked-down CSP is safe.
 */

import { NextResponse, type NextRequest } from "next/server";

export function middleware(_request: NextRequest): NextResponse {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
}

export const config = {
    matcher: "/api/(.*)",
};
