/**
 * Root middleware sets defensive security headers on every `/api/*` response.
 *
 * Headers asserted:
 *   - Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
 *   - X-Content-Type-Options: nosniff
 *
 * Both regular API routes and better-auth routes (under `/api/auth/*`) get the
 * same JSON-safe headers; default-src 'none' is fine for JSON bodies and we
 * never need to load assets through auth responses.
 */

import { middleware } from "@/middleware";
import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

const CSP = "default-src 'none'; frame-ancestors 'none'";
const NOSNIFF = "nosniff";

const get = (url: string) => middleware(new NextRequest(new URL(url)));

describe("root middleware /api/* security headers", () => {
    test("sets CSP and nosniff on a /api/v1/* response", () => {
        const res = get("http://localhost/api/v1/events");
        expect(res.headers.get("Content-Security-Policy")).toBe(CSP);
        expect(res.headers.get("X-Content-Type-Options")).toBe(NOSNIFF);
    });

    test("sets CSP and nosniff on a /api/auth/* response (better-auth)", () => {
        const res = get("http://localhost/api/auth/sign-in/email");
        expect(res.headers.get("Content-Security-Policy")).toBe(CSP);
        expect(res.headers.get("X-Content-Type-Options")).toBe(NOSNIFF);
    });

    test("sets CSP and nosniff on a /api/internal/* response", () => {
        const res = get("http://localhost/api/internal/workspace/x/activity");
        expect(res.headers.get("Content-Security-Policy")).toBe(CSP);
        expect(res.headers.get("X-Content-Type-Options")).toBe(NOSNIFF);
    });
});
