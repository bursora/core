import {
    isNonNegativeDecimal,
    isValidDiscordUrl,
    isValidEffectiveRange,
    isValidSlackUrl,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/validation";
import { describe, expect, test } from "bun:test";

describe("isNonNegativeDecimal", () => {
    test("rejects empty", () => {
        expect(isNonNegativeDecimal("")).toBe(false);
    });
    test("rejects negative", () => {
        expect(isNonNegativeDecimal("-0.01")).toBe(false);
    });
    test("accepts zero", () => {
        expect(isNonNegativeDecimal("0")).toBe(true);
    });
    test("accepts decimal", () => {
        expect(isNonNegativeDecimal("0.0025")).toBe(true);
    });
    test("rejects garbage", () => {
        expect(isNonNegativeDecimal("nope")).toBe(false);
    });
});

describe("isValidSlackUrl", () => {
    test("accepts empty (clears channel)", () => {
        expect(isValidSlackUrl("")).toBe(true);
    });
    test("accepts hooks.slack.com prefix", () => {
        expect(isValidSlackUrl("https://hooks.slack.com/services/T/B/x")).toBe(true);
    });
    test("rejects other host", () => {
        expect(isValidSlackUrl("https://evil.example.com/")).toBe(false);
    });
});

describe("isValidDiscordUrl", () => {
    test("accepts empty", () => {
        expect(isValidDiscordUrl("")).toBe(true);
    });
    test("accepts discord.com webhooks", () => {
        expect(isValidDiscordUrl("https://discord.com/api/webhooks/1/x")).toBe(true);
    });
    test("accepts discordapp.com webhooks", () => {
        expect(isValidDiscordUrl("https://discordapp.com/api/webhooks/1/x")).toBe(true);
    });
    test("rejects other host", () => {
        expect(isValidDiscordUrl("https://evil.example.com/")).toBe(false);
    });
});

describe("isValidEffectiveRange", () => {
    test("accepts empty effectiveTo", () => {
        expect(isValidEffectiveRange({ effectiveFrom: "2025-01-01T00:00", effectiveTo: "" })).toBe(
            true,
        );
    });
    test("rejects effectiveTo equal to effectiveFrom", () => {
        expect(
            isValidEffectiveRange({
                effectiveFrom: "2025-01-01T00:00",
                effectiveTo: "2025-01-01T00:00",
            }),
        ).toBe(false);
    });
    test("rejects effectiveTo before effectiveFrom", () => {
        expect(
            isValidEffectiveRange({
                effectiveFrom: "2025-02-01T00:00",
                effectiveTo: "2025-01-01T00:00",
            }),
        ).toBe(false);
    });
    test("accepts effectiveTo after effectiveFrom", () => {
        expect(
            isValidEffectiveRange({
                effectiveFrom: "2025-01-01T00:00",
                effectiveTo: "2025-02-01T00:00",
            }),
        ).toBe(true);
    });
});
