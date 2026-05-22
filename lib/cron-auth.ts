/**
 * Shared CRON auth helper.
 *
 * Cron routes (`/api/cron/*`) accept only callers presenting the shared
 * `CRON_SECRET` as `Authorization: Bearer <secret>`. We verify with
 * `timingSafeEqual` over the raw bytes — comparing JS string lengths is
 * unsafe because non-ASCII headers have more bytes than characters, which
 * would throw inside `timingSafeEqual` (it requires equal-length buffers).
 *
 * `assertCronAuthorized` returns void on success or throws the
 * NextResponse-shaped 401 the caller can re-throw. We return the response
 * directly via `Response` so the route handler can `throw response` and let
 * Next surface the body unchanged.
 */

import "server-only";

import { env } from "./env";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const UNAUTHORIZED = (): NextResponse =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 });

/**
 * Throws a 401 NextResponse when the request is missing or has the wrong
 * cron bearer token. Otherwise returns void.
 *
 * Routes use this as:
 *
 *     try { assertCronAuthorized(request); }
 *     catch (res) { return res as NextResponse; }
 *
 * — keeping the handler body unindented while preserving the 401 surface.
 */
export function assertCronAuthorized(request: Request): void {
    const authHeader = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${env().CRON_SECRET}`;
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    // timingSafeEqual requires equal-length buffers. A non-ASCII header may
    // encode to more bytes than characters, so we compare byte lengths — the
    // string `.length` check is wrong for multi-byte input.
    if (a.length !== b.length) throw UNAUTHORIZED();
    if (!timingSafeEqual(a, b)) throw UNAUTHORIZED();
}
