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

// Two event buckets anchored to noon today (and an hour earlier) so they always
// land in the same calendar-day group regardless of when the test runs. Distinct
// counts (3, 1) let the assertions tell the day total apart from each bucket.
const sameDayBuckets = () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    return [
        { at: noon, count: 3 },
        { at: new Date(noon.getTime() - 60 * 60 * 1000), count: 1 },
    ];
};

const seedSameDayBuckets = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => sameDayBuckets(),
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
};

const seedAlertPlusSameDayEvents = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => sameDayBuckets(),
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

const triggerCount = (html: string) => (html.match(/data-slot="accordion-trigger"/g) ?? []).length;

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

    test("folds same-day event buckets into one collapsed summary row", async () => {
        seedSameDayBuckets();

        const html = await renderActivity();

        // One summary trigger for the whole day, showing the day total (3 + 1).
        expect(triggerCount(html)).toBe(1);
        expect(html).toContain("4 events");
        // Collapsed by default — the disclosure starts closed.
        expect(html).toContain('data-state="closed"');
        // Closed content unmounts, so the per-hour breakdown stays out of the
        // markup until the row is expanded. (This is what the fold buys.)
        expect(html).not.toContain("3 events");
        expect(html).not.toContain("1 event");
    });

    test("a single same-day event renders as a plain row, not a folded summary", async () => {
        seedManyBuckets(1);

        const html = await renderActivity();

        // Fewer than two events in a day: no disclosure, just the plain row.
        expect(triggerCount(html)).toBe(0);
        expect(html).toContain("1 event");
    });

    test('drops the "in past hour" phrase from event rows', async () => {
        seedSameDayBuckets();

        const html = await renderActivity();

        expect(html).not.toContain("in past hour");
    });

    test("alerts stay as their own row, unaffected by event grouping", async () => {
        seedAlertPlusSameDayEvents();

        const html = await renderActivity();

        // Events collapse to a single summary; the alert is not folded in.
        expect(triggerCount(html)).toBe(1);
        expect(html).toContain("4 events");
        expect(html).toContain("tenant spike");
        expect(html).toContain(`/workspace/${WORKSPACE}/alerts`);
    });
});
