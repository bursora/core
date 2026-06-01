/**
 * Tests for `actionOk` / `actionFail` in `lib/action-result.ts`.
 *
 * The standard result envelope every server action returns. Success carries
 * only `ok: true`; failure carries `ok: false` plus an `error`, and an
 * optional `fieldErrors` map present only when supplied.
 */

import { actionFail, actionOk } from "@/lib/action-result";
import { describe, expect, test } from "bun:test";

describe("actionOk", () => {
    test("returns ok with no error or fieldErrors keys", () => {
        const result = actionOk();
        expect(result).toEqual({ ok: true });
        expect("error" in result).toBe(false);
        expect("fieldErrors" in result).toBe(false);
    });
});

describe("actionFail", () => {
    test("returns ok false with the error and omits fieldErrors when not passed", () => {
        const result = actionFail("Something broke");
        expect(result).toEqual({ ok: false, error: "Something broke" });
        expect("fieldErrors" in result).toBe(false);
    });

    test("includes fieldErrors when passed", () => {
        const fieldErrors = { email: "Enter a valid email address" };
        const result = actionFail("Validation failed", fieldErrors);
        expect(result).toEqual({ ok: false, error: "Validation failed", fieldErrors });
    });
});
