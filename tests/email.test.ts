/**
 * Tests for `emailSchema` / `isValidEmail` in `lib/email.ts`.
 *
 * Single source of truth for email validation across the app. `isValidEmail`
 * is a boolean convenience over `emailSchema.safeParse`; the schema carries the
 * "Enter a valid email address" message on failure.
 */

import { emailSchema, isValidEmail } from "@/lib/email";
import { describe, expect, test } from "bun:test";

describe("isValidEmail", () => {
    test("true for a valid address", () => {
        expect(isValidEmail("dev@bursora.com")).toBe(true);
    });

    test.each([
        ["missing @", "devbursora.com"],
        ["missing domain", "dev@"],
        ["empty string", ""],
        ["whitespace only", "   "],
    ])("false for %s", (_label, value) => {
        expect(isValidEmail(value)).toBe(false);
    });
});

describe("emailSchema", () => {
    test("safeParse failure carries the validation message", () => {
        const result = emailSchema.safeParse("not-an-email");
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe("Enter a valid email address");
    });
});
