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
        expect(html).toContain("cursor=");
    });

    test("key rows link to the keys page", async () => {
        seedKeyIssued();

        const { ActivityTab } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/settings/_components/activity-tab");
        const element = await ActivityTab({ workspaceId: WORKSPACE, searchParams: {} });
        const html = renderToStaticMarkup(element);

        expect(html).toContain(`/workspace/${WORKSPACE}/keys`);
    });
});
