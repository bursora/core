/**
 * Tests for the shared UUID helpers.
 *
 * `isUuid` validates canonical RFC 4122 strings; `deterministicUuid`
 * mints a stable v5-shaped id from a natural key so producers can
 * dedup via `ON CONFLICT (id) DO NOTHING`.
 */

import { deterministicUuid, isUuid } from "@/lib/uuid";
import { describe, expect, test } from "bun:test";

describe("isUuid", () => {
    test("accepts a canonical v4 UUID", () => {
        expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
    });

    test("accepts a canonical v5 UUID", () => {
        expect(isUuid("886313e1-3b8a-5372-9b90-0c9aee199e5d")).toBe(true);
    });

    test("accepts uppercase hex", () => {
        expect(isUuid("F47AC10B-58CC-4372-A567-0E02B2C3D479")).toBe(true);
    });

    test("rejects the empty string", () => {
        expect(isUuid("")).toBe(false);
    });

    test("rejects a malformed string", () => {
        expect(isUuid("not-a-uuid")).toBe(false);
    });

    test("rejects a non-hex character", () => {
        expect(isUuid("g47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(false);
    });

    test("rejects wrong segment lengths", () => {
        expect(isUuid("f47ac10b-58c-4372-a567-0e02b2c3d479")).toBe(false);
    });

    test("rejects a UUID missing hyphens", () => {
        expect(isUuid("f47ac10b58cc4372a5670e02b2c3d479")).toBe(false);
    });

    test("rejects trailing whitespace", () => {
        expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479 ")).toBe(false);
    });
});

describe("deterministicUuid", () => {
    test("returns the same output for the same key across calls", () => {
        expect(deterministicUuid("workspace:scope:bucket")).toBe(
            deterministicUuid("workspace:scope:bucket"),
        );
    });

    test("returns distinct outputs for distinct keys", () => {
        expect(deterministicUuid("key-a")).not.toBe(deterministicUuid("key-b"));
    });

    test("sets the version nibble to 5", () => {
        expect(deterministicUuid("any-key").charAt(14)).toBe("5");
    });

    test("sets the variant high bits to 10xx", () => {
        expect(["8", "9", "a", "b"]).toContain(deterministicUuid("any-key").charAt(19));
    });

    test("produces output that passes isUuid", () => {
        expect(isUuid(deterministicUuid("any-key"))).toBe(true);
    });

    test("handles the empty key", () => {
        expect(isUuid(deterministicUuid(""))).toBe(true);
    });
});
