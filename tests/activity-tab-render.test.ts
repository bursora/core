/**
 * Render-side test for the Settings → Activity log tab. Seeds the compose
 * layer's fetcher hooks via setActivityDepsForTesting and asserts the RSC
 * produces a Card+Table with severity strip and the right row links.
 */

import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

beforeAll(() => {
    mock.module("next/headers", () => ({
        headers: async () => new Headers(),
    }));
    mock.module("next/navigation", () => ({
        useRouter: () => ({ replace: () => undefined, push: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
        usePathname: () => "/",
        notFound: () => {
            throw new Error("NEXT_NOT_FOUND");
        },
        redirect: () => {
            throw new Error("NEXT_REDIRECT");
        },
        permanentRedirect: () => {
            throw new Error("NEXT_REDIRECT");
        },
    }));
});

afterEach(() => setActivityDepsForTesting(null));

const seedEmpty = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
};

const seedAlert = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => {
            const raisedAt = new Date(Date.now() - 60 * 1000);
            return [
                {
                    kind: "anomaly",
                    scope: { workspaceId: WORKSPACE, tenantId: "acme", agentId: null },
                    reason: "tenant spike",
                    deviation: 4.5,
                    severity: "critical",
                    raisedAt,
                    windowStart: raisedAt,
                    windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
                    windowCostUsd: 0.5,
                },
            ];
        },
        fetchKeyEvents: async () => [],
    });
};

const seedKeyIssued = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [
            {
                id: "key-1234abcd",
                createdAt: new Date(Date.now() - 60 * 1000),
                revokedAt: null,
            },
        ],
    });
};

const seedManyBuckets = (count: number) => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => {
            const now = Date.now();
            return Array.from({ length: count }, (_, i) => ({
                at: new Date(now - i * 60 * 60 * 1000),
                count: 1,
            }));
        },
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
};

// The data layer returns one event bucket per calendar day. Anchor it to noon
// today so it always lands in today's group regardless of when the test runs.
const todayBucket = () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    return [{ at: noon, count: 4 }];
};

const seedTodayBucket = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => todayBucket(),
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
};

const seedAlertPlusTodayEvents = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => todayBucket(),
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => {
            const raisedAt = new Date(Date.now() - 60 * 1000);
            return [
                {
                    kind: "anomaly",
                    scope: { workspaceId: WORKSPACE, tenantId: "acme", agentId: null },
                    reason: "tenant spike",
                    deviation: 4.5,
                    severity: "critical",
                    raisedAt,
                    windowStart: raisedAt,
                    windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
                    windowCostUsd: 0.5,
                },
            ];
        },
        fetchKeyEvents: async () => [],
    });
};

const renderActivity = async () => {
    const { ActivityTab } =
        await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
    const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
    return renderToStaticMarkup(element);
};

describe("ActivityTab", () => {
    test("renders empty-state copy when no items", async () => {
        seedEmpty();

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("No activity in this range");
    });

    test("renders a table row for an alert with severity styling and link to alerts page", async () => {
        seedAlert();

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("tenant spike");
        expect(html).toContain("tenant:acme");
        expect(html).toContain("bg-destructive");
        expect(html).toContain(`/workspace/${WORKSPACE}/alerts`);
    });

    test("renders Load more link when nextCursor present", async () => {
        // 100+ buckets at default limit (50) → nextCursor populated.
        seedManyBuckets(60);

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("Load more");
    });

    test("key rows link to the keys page", async () => {
        seedKeyIssued();

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
        const html = renderToStaticMarkup(element);

        expect(html).toContain(`/workspace/${WORKSPACE}/keys`);
    });

    test("renders a day's events as a single plain row, no accordion", async () => {
        seedTodayBucket();

        const html = await renderActivity();

        expect(html).toContain("4 events");
        // No expandable disclosure — the day total is the row.
        expect(html).not.toContain('data-slot="accordion-trigger"');
    });

    test('drops the "in past hour" phrase from event rows', async () => {
        seedTodayBucket();

        const html = await renderActivity();

        expect(html).not.toContain("in past hour");
    });

    test("alerts render as their own row alongside the day's events", async () => {
        seedAlertPlusTodayEvents();

        const html = await renderActivity();

        // The event row and the alert row both show; the alert is its own row.
        expect(html).toContain("4 events");
        expect(html).toContain("tenant spike");
        expect(html).toContain(`/workspace/${WORKSPACE}/alerts`);
        expect(html).not.toContain('data-slot="accordion-trigger"');
    });

    test("the `to` bound drops items after the selected end date", async () => {
        // One bucket inside [from, to], one after `to` (but before now). The
        // upper bound must exclude the later bucket.
        setActivityDepsForTesting({
            fetchEventBuckets: async () => [
                { at: new Date("2026-05-15T12:00:00Z"), count: 5 },
                { at: new Date("2026-05-25T12:00:00Z"), count: 9 },
            ],
            fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
            fetchKeyEvents: async () => [],
        });

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({
            workspaceId: WORKSPACE,
            searchParams: { from: "2026-05-10T00:00:00Z", to: "2026-05-20T00:00:00Z" },
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("5 events");
        expect(html).not.toContain("9 events");
    });
});
