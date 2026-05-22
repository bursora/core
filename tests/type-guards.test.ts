import { oneOf } from "@/lib/type-guards";
import { describe, expect, test } from "bun:test";

describe("oneOf", () => {
    const isColor = oneOf(["red", "green", "blue"] as const);

    test("returns true for a value in the set", () => {
        expect(isColor("red")).toBe(true);
        expect(isColor("blue")).toBe(true);
    });

    test("returns false for a value not in the set", () => {
        expect(isColor("yellow")).toBe(false);
        expect(isColor("")).toBe(false);
    });

    test("returns false for undefined", () => {
        expect(isColor(undefined)).toBe(false);
    });

    test("narrows the input type for downstream code", () => {
        const value: string | undefined = "red";
        if (isColor(value)) {
            // value is now "red" | "green" | "blue"
            const ok: "red" | "green" | "blue" = value;
            expect(ok).toBe("red");
        }
    });
});
