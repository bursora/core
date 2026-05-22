/**
 * Tests for `readMeteringStatus` — parses the `/spend` URL `status` param into
 * the `MeteringStatusFilter` union. Missing / unknown values default to `'ok'`
 * so the dashboard's historical behavior is preserved.
 */

import { readMeteringStatus } from "@/lib/search-params";
import { describe, expect, test } from "bun:test";

describe("readMeteringStatus", () => {
    test("defaults to 'ok' when the param is undefined", () => {
        expect(readMeteringStatus(undefined)).toBe("ok");
    });

    test("defaults to 'ok' when the param is an empty string", () => {
        expect(readMeteringStatus("")).toBe("ok");
    });

    test("defaults to 'ok' when the param is unknown", () => {
        expect(readMeteringStatus("nope")).toBe("ok");
    });

    test("returns 'ok' when explicitly set", () => {
        expect(readMeteringStatus("ok")).toBe("ok");
    });

    test("returns 'blocked' when set", () => {
        expect(readMeteringStatus("blocked")).toBe("blocked");
    });

    test("returns 'both' when set", () => {
        expect(readMeteringStatus("both")).toBe("both");
    });
});
