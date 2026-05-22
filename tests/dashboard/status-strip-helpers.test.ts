/**
 * Pure helpers powering the dashboard status strip.
 *
 * `heartbeatTone` maps the time since the last usage event to a semantic tone:
 *   - null            → "muted"        (no events yet)
 *   - < 5 min ago     → "success"      (SDK is alive and emitting)
 *   - < 1 hour ago    → "warning"      (quiet but still recent)
 *   - older           → "destructive"  (silent for an hour+)
 */

import {
    channelTone,
    heartbeatTone,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/status-strip-helpers";
import type { ChannelHealthRow } from "@/lib/notifications/channel-health";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2026-05-16T12:00:00.000Z");

const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

describe("heartbeatTone", () => {
    test("returns 'muted' when there is no last event", () => {
        expect(heartbeatTone(null, NOW)).toBe("muted");
    });

    test("returns 'success' when the last event is under 5 minutes old", () => {
        expect(heartbeatTone(ago(30 * 1000), NOW)).toBe("success");
        expect(heartbeatTone(ago(4 * 60 * 1000 + 59 * 1000), NOW)).toBe("success");
    });

    test("returns 'warning' when the last event is between 5 minutes and 1 hour", () => {
        expect(heartbeatTone(ago(5 * 60 * 1000), NOW)).toBe("warning");
        expect(heartbeatTone(ago(59 * 60 * 1000), NOW)).toBe("warning");
    });

    test("returns 'destructive' when the last event is at least an hour old", () => {
        expect(heartbeatTone(ago(60 * 60 * 1000), NOW)).toBe("destructive");
        expect(heartbeatTone(ago(2 * 60 * 60 * 1000), NOW)).toBe("destructive");
    });
});

const row = (overrides: Partial<ChannelHealthRow> = {}): ChannelHealthRow => ({
    kind: "slack",
    lastAttemptAt: null,
    lastStatus: null,
    lastError: null,
    recentFailureCount: 0,
    ...overrides,
});

describe("channelTone", () => {
    test("returns 'success' when last ok is within the last hour", () => {
        expect(
            channelTone(row({ lastStatus: "ok", lastAttemptAt: ago(10 * 60 * 1000) }), NOW),
        ).toBe("success");
    });

    test("returns 'warning' when last ok is older than an hour but inside 24h", () => {
        expect(
            channelTone(row({ lastStatus: "ok", lastAttemptAt: ago(2 * 60 * 60 * 1000) }), NOW),
        ).toBe("warning");
    });

    test("returns 'warning' for a single recent failure", () => {
        expect(
            channelTone(
                row({
                    lastStatus: "failed",
                    lastAttemptAt: ago(2 * 60 * 1000),
                    recentFailureCount: 1,
                    lastError: "401 Unauthorized",
                }),
                NOW,
            ),
        ).toBe("warning");
    });

    test("returns 'destructive' once recent failures reach three", () => {
        expect(
            channelTone(
                row({
                    lastStatus: "failed",
                    lastAttemptAt: ago(2 * 60 * 1000),
                    recentFailureCount: 3,
                    lastError: "500",
                }),
                NOW,
            ),
        ).toBe("destructive");
    });

    test("returns 'destructive' when last attempt failed and no ok inside the hour", () => {
        // Single recent failure with no last-hour ok still trips destructive
        // because the channel is currently broken from the user's viewpoint.
        expect(
            channelTone(
                row({
                    lastStatus: "failed",
                    lastAttemptAt: ago(90 * 60 * 1000),
                    recentFailureCount: 1,
                    lastError: "timeout",
                }),
                NOW,
            ),
        ).toBe("destructive");
    });

    test("returns 'destructive' when configured channel has no attempt in over 24h", () => {
        expect(
            channelTone(row({ lastStatus: "ok", lastAttemptAt: ago(25 * 60 * 60 * 1000) }), NOW),
        ).toBe("destructive");
    });

    test("returns 'destructive' when configured channel has never delivered", () => {
        // Configured but never attempted → broken from the user's perspective.
        expect(channelTone(row({ lastAttemptAt: null }), NOW)).toBe("destructive");
    });
});
