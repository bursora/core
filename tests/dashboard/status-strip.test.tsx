/**
 * StatusStrip: single-row health strip rendered above the dashboard
 * Runway hero. Surfaces the SDK heartbeat (color-coded dot + "N ago"),
 * a Slack/Discord dot per configured channel, and a setup-errors counter
 * (red when N > 0, muted when 0).
 *
 * The component ships a `createStatusStrip(deps)` factory so the
 * production default can stay wired to bound module functions while
 * tests construct their own deterministic instance. All time-relative
 * strings are deterministic given a fixed `now`, so we inject `now` for
 * snapshot stability.
 */

import { createStatusStrip } from "@/app/(dashboard)/workspace/[workspaceId]/_components/status-strip";
import type { ChannelHealthRow } from "@/lib/notifications/channel-health";
import type { NotificationItem } from "@/lib/notifications/types";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = new Date("2026-05-16T12:00:00.000Z");

const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
    id: "n1",
    workspaceName: "Acme",
    source: "setup_error",
    dedupKey: "setup_error:auth_revoked:2026-05-19T10:00:00.000Z",
    severity: "warning",
    title: "Title",
    body: "Body",
    createdAt: NOW.toISOString(),
    href: null,
    read: false,
    display: "inline",
    ...overrides,
});

interface StubInput {
    readonly lastEventAt?: Date | null;
    readonly notifications?: readonly NotificationItem[];
    readonly channels?: readonly ChannelHealthRow[];
}

async function renderWith(input: StubInput): Promise<string> {
    const StatusStrip = createStatusStrip({
        getLastEventAt: async () => input.lastEventAt ?? null,
        listSetupNotifications: async () => input.notifications ?? [],
        getChannelHealth: async () => input.channels ?? [],
    });
    const element = await StatusStrip({ workspaceId: WORKSPACE, userId: USER, now: NOW });
    return renderToStaticMarkup(element);
}

describe("StatusStrip", () => {
    test("renders the SDK label and a fresh-tone dot when an event arrived under 5 min ago", async () => {
        const html = await renderWith({ lastEventAt: ago(30 * 1000) });

        expect(html).toContain("SDK");
        expect(html).toContain("text-success");
    });

    test("shows 'no events yet' with a muted dot when there is no last event", async () => {
        const html = await renderWith({ lastEventAt: null });

        expect(html).toContain("no events yet");
        expect(html).toContain("bg-muted-foreground/40");
        expect(html).not.toContain("bg-success");
    });

    test("uses warning tone when the last event is between 5 minutes and 1 hour", async () => {
        const html = await renderWith({ lastEventAt: ago(30 * 60 * 1000) });

        expect(html).toContain("text-warning");
    });

    test("uses destructive tone when the last event is at least an hour old", async () => {
        const html = await renderWith({ lastEventAt: ago(2 * 60 * 60 * 1000) });

        expect(html).toContain("text-destructive");
    });

    test("renders a relative time string for the last event", async () => {
        const html = await renderWith({ lastEventAt: ago(30 * 1000) });

        expect(html).toMatch(/30\s+seconds ago/);
    });

    test("renders a muted setup-errors counter of 0 when there are no notifications", async () => {
        const html = await renderWith({ lastEventAt: ago(30 * 1000) });

        expect(html).toContain("setup errors");
        expect(html).toMatch(/setup errors[\s\S]*?\b0\b/);
        expect(html).not.toContain("text-destructive");
    });

    test("renders the count and a destructive tone when setup errors are present", async () => {
        const html = await renderWith({
            lastEventAt: ago(30 * 1000),
            notifications: [
                item({ id: "a", severity: "warning" }),
                item({ id: "b", severity: "critical" }),
            ],
        });

        expect(html).toMatch(/setup errors[\s\S]*?\b2\b/);
        expect(html).toContain("text-destructive");
    });

    test("uses font-mono, uppercase, tracked labels and tabular-nums for counts", async () => {
        const html = await renderWith({
            lastEventAt: ago(30 * 1000),
            notifications: [item({ severity: "warning" })],
        });

        expect(html).toContain("font-mono");
        expect(html).toContain("uppercase");
        expect(html).toContain("tracking-[0.08em]");
        expect(html).toContain("tabular-nums");
    });

    test("renders no channel dots when no channels are configured", async () => {
        const html = await renderWith({ lastEventAt: ago(30 * 1000), channels: [] });

        expect(html).not.toContain("SLACK");
        expect(html).not.toContain("DISCORD");
    });

    test("renders one labeled dot per configured channel with a tooltip-bearing wrapper", async () => {
        const html = await renderWith({
            lastEventAt: ago(30 * 1000),
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: ago(3 * 60 * 1000),
                    lastStatus: "ok",
                    lastError: null,
                    recentFailureCount: 0,
                },
                {
                    kind: "discord",
                    lastAttemptAt: ago(12 * 60 * 1000),
                    lastStatus: "failed",
                    lastError: "401",
                    recentFailureCount: 1,
                },
            ],
        });

        expect(html).toContain("SLACK");
        expect(html).toContain("DISCORD");
        expect(html).toContain("bg-success");
        expect(html).toContain("bg-warning");
    });

    test("renders 'no deliveries yet' wording when a channel has no attempts", async () => {
        const html = await renderWith({
            lastEventAt: ago(30 * 1000),
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: null,
                    lastStatus: null,
                    lastError: null,
                    recentFailureCount: 0,
                },
            ],
        });

        expect(html).toContain("SLACK");
        expect(html).toContain("no deliveries yet");
        expect(html).toContain("bg-destructive");
    });

    test("includes the failure reason in the tooltip when last attempt failed", async () => {
        const html = await renderWith({
            lastEventAt: ago(30 * 1000),
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: ago(2 * 60 * 1000),
                    lastStatus: "failed",
                    lastError: "401 Unauthorized",
                    recentFailureCount: 1,
                },
            ],
        });

        expect(html).toContain("401 Unauthorized");
        expect(html).toContain("failed");
    });
});
