/**
 * Zod validation for the /profile name form. Trims whitespace, requires
 * a non-empty value, caps length at 60. Server action re-runs this on the
 * submitted FormData before hitting the use case.
 */

import { updateProfileSchema } from "@/app/(dashboard)/profile/validation";
import { describe, expect, test } from "bun:test";

describe("updateProfileSchema", () => {
    test("accepts a normal name", () => {
        const result = updateProfileSchema.safeParse({ name: "Ada Lovelace" });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.name).toBe("Ada Lovelace");
    });

    test("trims surrounding whitespace", () => {
        const result = updateProfileSchema.safeParse({ name: "  Ada  " });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.name).toBe("Ada");
    });

    test("rejects empty string", () => {
        const result = updateProfileSchema.safeParse({ name: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toBe("Name is required");
        }
    });

    test("rejects whitespace-only", () => {
        const result = updateProfileSchema.safeParse({ name: "   " });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toBe("Name is required");
        }
    });

    test("accepts exactly 60 characters", () => {
        const name = "a".repeat(60);
        const result = updateProfileSchema.safeParse({ name });
        expect(result.success).toBe(true);
    });

    test("rejects 61 characters", () => {
        const name = "a".repeat(61);
        const result = updateProfileSchema.safeParse({ name });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toBe("Max 60 characters");
        }
    });
});
