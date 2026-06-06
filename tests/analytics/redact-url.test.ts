/**
 * The root-mounted PostHog provider wraps `/invite/[token]`, so `$current_url`,
 * `$pathname`, and `$referrer` can carry a live 24h workspace-join secret (the
 * invite token) or a `next=` param pointing back at one. `redactSensitiveUrl`
 * is the pure scrubber `sanitize_properties` runs on those props before any
 * event leaves the browser. These tests pin the privacy contract: invite tokens
 * and next-param targets are redacted; everything else is left intact.
 */

import { redactSensitiveUrl } from "@/lib/analytics/redact-url";
import { describe, expect, test } from "bun:test";

describe("redactSensitiveUrl", () => {
    test("redacts the invite token in a bare path", () => {
        const token = "a".repeat(48);
        expect(redactSensitiveUrl(`/invite/${token}`)).toBe("/invite/[token]");
    });

    test("redacts the invite token in an absolute url and keeps host + trailing path", () => {
        const token = "0123456789abcdef0123456789abcdef0123456789abcdef";
        expect(redactSensitiveUrl(`https://app.bursora.com/invite/${token}`)).toBe(
            "https://app.bursora.com/invite/[token]",
        );
    });

    test("redacts a next param that points at an invite url", () => {
        expect(redactSensitiveUrl("https://app.bursora.com/login?next=/invite/abc123")).toBe(
            "https://app.bursora.com/login?next=[redacted]",
        );
    });

    test("redacts a url-encoded next param", () => {
        expect(
            redactSensitiveUrl("https://app.bursora.com/login?next=%2Finvite%2Fdeadbeef1234"),
        ).toBe("https://app.bursora.com/login?next=[redacted]");
    });

    test("redacts a next param even alongside other query params", () => {
        expect(redactSensitiveUrl("/login?foo=1&next=%2Finvite%2Fcafe&bar=2")).toBe(
            "/login?foo=1&next=[redacted]&bar=2",
        );
    });

    test("leaves a normal dashboard url untouched", () => {
        const url = "https://app.bursora.com/workspace/ws-1/budgets?range=7d";
        expect(redactSensitiveUrl(url)).toBe(url);
    });

    test("leaves a path that merely contains the word invite untouched", () => {
        expect(redactSensitiveUrl("/docs/invited-teammates")).toBe("/docs/invited-teammates");
    });

    test("returns empty input unchanged", () => {
        expect(redactSensitiveUrl("")).toBe("");
    });
});
