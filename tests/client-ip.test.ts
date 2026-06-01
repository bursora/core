/**
 * Tests for `clientIpFromHeaders` in `lib/client-ip.ts`.
 *
 * Best-effort client IP from proxy headers: first hop of an `x-forwarded-for`
 * chain, falling back to `x-real-ip`, else null. Accepts anything with a
 * `get(name)` reader, so both a real `Headers` and a plain object qualify.
 */

import { clientIpFromHeaders } from "@/lib/client-ip";
import { describe, expect, test } from "bun:test";

describe("clientIpFromHeaders", () => {
    test("returns the first hop of an x-forwarded-for chain, trimmed", () => {
        const headers = new Headers({
            "x-forwarded-for": " 203.0.113.7 , 70.41.3.18, 150.172.238.178",
        });
        expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
    });

    test("falls back to x-real-ip when x-forwarded-for is absent, trimmed", () => {
        const headers = new Headers({ "x-real-ip": "  198.51.100.42 " });
        expect(clientIpFromHeaders(headers)).toBe("198.51.100.42");
    });

    test("returns null when neither header is present", () => {
        expect(clientIpFromHeaders(new Headers())).toBeNull();
    });

    test("skips an empty/whitespace first x-forwarded-for entry, falls back to x-real-ip", () => {
        const headers = new Headers({
            "x-forwarded-for": "   , 70.41.3.18",
            "x-real-ip": "198.51.100.42",
        });
        expect(clientIpFromHeaders(headers)).toBe("198.51.100.42");
    });

    test("returns null when x-forwarded-for first entry is empty and no x-real-ip", () => {
        const headers = new Headers({ "x-forwarded-for": "   ,70.41.3.18" });
        expect(clientIpFromHeaders(headers)).toBeNull();
    });

    test("returns null when x-real-ip is whitespace-only", () => {
        const headers = new Headers({ "x-real-ip": "   " });
        expect(clientIpFromHeaders(headers)).toBeNull();
    });

    test("accepts any object exposing a get(name) reader", () => {
        const reader = { get: (name: string) => (name === "x-real-ip" ? "192.0.2.1" : null) };
        expect(clientIpFromHeaders(reader)).toBe("192.0.2.1");
    });
});
