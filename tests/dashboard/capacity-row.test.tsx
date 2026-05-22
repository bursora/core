/**
 * CapacityRow — final dashboard row of 3 StatTile cards covering API-keys
 * heartbeat, member roster (with pending invites), and channel health.
 *
 * Server component built via `createCapacityRow(deps)` factory — the same
 * seam pattern used by `status-strip.tsx`. Production binding wires real
 * loaders; tests inject deterministic stubs.
 */

import { createCapacityRow } from "@/app/(dashboard)/workspace/[workspaceId]/_components/capacity-row";
import type { ChannelHealthRow } from "@/lib/notifications/channel-health";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-05-16T12:00:00.000Z");

interface StubInput {
    readonly keysCount?: number;
    readonly lastEventAt?: Date | null;
    readonly memberCount?: number;
    readonly pendingCount?: number;
    readonly channels?: readonly ChannelHealthRow[];
}

async function render(input: StubInput = {}): Promise<string> {
    const CapacityRow = createCapacityRow({
        getKeysCount: async () => input.keysCount ?? 1,
        getLastEventAt: async () => input.lastEventAt ?? null,
        getMemberCount: async () => input.memberCount ?? 1,
        getPendingCount: async () => input.pendingCount ?? 0,
        getChannelHealth: async () => input.channels ?? [],
    });
    const element = await CapacityRow({ workspaceId: WORKSPACE, now: NOW });
    return renderToStaticMarkup(element);
}

describe("CapacityRow tiles", () => {
    test("renders three tiles with API keys, Members, and Channels labels", async () => {
        const html = await render();

        expect(html).toContain("API keys");
        expect(html).toContain("Members");
        expect(html).toContain("Channels");
    });

    test("renders the API-keys count, member count, and channel count", async () => {
        const html = await render({
            keysCount: 4,
            memberCount: 7,
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: null,
                    lastStatus: null,
                    lastError: null,
                    recentFailureCount: 0,
                },
                {
                    kind: "discord",
                    lastAttemptAt: null,
                    lastStatus: null,
                    lastError: null,
                    recentFailureCount: 0,
                },
            ],
        });

        expect(html).toMatch(/API keys[\s\S]*?\b4\b/);
        expect(html).toMatch(/Members[\s\S]*?\b7\b/);
        expect(html).toMatch(/Channels[\s\S]*?\b2\b/);
    });
});

describe("CapacityRow API-keys tile hint and tone", () => {
    test("renders 'no events yet' when getLastEventAt returns null", async () => {
        const html = await render({ keysCount: 1, lastEventAt: null });

        expect(html).toContain("no events yet");
    });

    test("renders 'last used <relative>' when getLastEventAt returns a Date", async () => {
        const html = await render({
            keysCount: 1,
            lastEventAt: new Date(NOW.getTime() - 5 * 60 * 1000),
        });

        expect(html).toMatch(/last used[\s\S]*?5\s+minutes ago/);
    });

    test("API-keys tile shows warning tone when keysCount is 0", async () => {
        const html = await render({ keysCount: 0 });

        expect(html).toContain("bg-warning");
    });

    test("API-keys tile shows muted tone when keysCount > 0", async () => {
        const html = await render({ keysCount: 3 });

        expect(html).not.toContain("bg-warning");
        expect(html).not.toContain("bg-destructive");
    });
});

describe("CapacityRow Members tile hint", () => {
    test("shows '<n> pending' when there are pending invites", async () => {
        const html = await render({ memberCount: 2, pendingCount: 3 });

        expect(html).toContain("3 pending");
    });

    test("shows 'manage' hint when there are no pending invites", async () => {
        const html = await render({ memberCount: 2, pendingCount: 0 });

        expect(html).toContain("manage");
    });
});

describe("CapacityRow Channels tile tone", () => {
    test("renders destructive tone when any channel lastStatus is failed", async () => {
        const html = await render({
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: new Date(NOW.getTime() - 60 * 1000),
                    lastStatus: "failed",
                    lastError: "401",
                    recentFailureCount: 1,
                },
            ],
        });

        expect(html).toContain("bg-destructive");
    });

    test("renders muted tone when channels are all ok", async () => {
        const html = await render({
            channels: [
                {
                    kind: "slack",
                    lastAttemptAt: new Date(NOW.getTime() - 60 * 1000),
                    lastStatus: "ok",
                    lastError: null,
                    recentFailureCount: 0,
                },
            ],
        });

        expect(html).not.toContain("bg-destructive");
    });
});

describe("CapacityRow links", () => {
    test("API-keys tile links to /workspace/<id>/keys", async () => {
        const html = await render();

        expect(html).toContain(`href="/workspace/${WORKSPACE}/keys"`);
    });

    test("Members tile links to /workspace/<id>/members", async () => {
        const html = await render();

        expect(html).toContain(`href="/workspace/${WORKSPACE}/members"`);
    });

    test("Channels tile links to /workspace/<id>/settings", async () => {
        const html = await render();

        expect(html).toContain(`href="/workspace/${WORKSPACE}/settings"`);
    });
});

describe("CapacityRow layout", () => {
    test("renders the 3-column grid shell", async () => {
        const html = await render();

        expect(html).toContain("grid-cols-1");
        expect(html).toContain("sm:grid-cols-3");
    });
});
