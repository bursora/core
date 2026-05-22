/**
 * Pulse feedback for alert channels save. Success and error states map
 * to specific border tokens; users who prefer reduced motion skip the
 * pulse entirely.
 */

import {
    PULSE_DURATION_MS,
    pulseClass,
    shouldPulse,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/_lib/pulse-feedback";
import { describe, expect, test } from "bun:test";

describe("pulseClass", () => {
    test("idle yields no class", () => {
        expect(pulseClass("idle")).toBe("");
    });

    test("success applies the success border token", () => {
        expect(pulseClass("success")).toBe("border-success");
    });

    test("error applies the destructive border token", () => {
        expect(pulseClass("error")).toBe("border-destructive");
    });
});

describe("shouldPulse", () => {
    test("respects prefers-reduced-motion by skipping pulse", () => {
        expect(shouldPulse(true)).toBe(false);
    });

    test("pulses when motion is allowed", () => {
        expect(shouldPulse(false)).toBe(true);
    });
});

describe("PULSE_DURATION_MS", () => {
    test("is short enough to be unobtrusive", () => {
        expect(PULSE_DURATION_MS).toBeGreaterThan(0);
        expect(PULSE_DURATION_MS).toBeLessThanOrEqual(2000);
    });
});
