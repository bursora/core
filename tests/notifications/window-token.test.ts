// Host TZ pinned off-UTC to prove localization reads the passed zone, not host.
process.env.TZ = "America/Los_Angeles";

import { encodeWindowToken, localizeNotificationBody } from "@/lib/notifications/window-token";
import { describe, expect, test } from "bun:test";

const window = {
    windowStart: new Date("2026-05-13T12:00:00Z"),
    windowEnd: new Date("2026-05-13T12:05:00Z"),
    windowCostUsd: 1.23,
};

describe("window-token", () => {
    test("encodes epoch ms + cost, no baked clock time", () => {
        const token = encodeWindowToken(window);
        expect(token).toBe(
            `[[win:${window.windowStart.getTime()}:${window.windowEnd.getTime()}:1.23]]`,
        );
        expect(token).not.toContain("12:00");
        expect(token).not.toContain("UTC");
    });

    test("localizes a token to the given zone; UTC by default", () => {
        const body = `Spend spiked. ${encodeWindowToken(window)}`;
        expect(localizeNotificationBody(body)).toBe(
            "Spend spiked. $1.23 spent between 12:00-12:05 UTC",
        );
        expect(localizeNotificationBody(body, "Europe/Tirane")).toBe(
            "Spend spiked. $1.23 spent between 14:00-14:05 GMT+2",
        );
    });

    test("leaves token-free bodies untouched", () => {
        expect(localizeNotificationBody("Budget exceeded - tenant:acme", "Europe/Tirane")).toBe(
            "Budget exceeded - tenant:acme",
        );
    });
});
