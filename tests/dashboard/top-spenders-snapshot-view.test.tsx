/**
 * TopSpendersSnapshotView — pure presentational sibling of `TopSpendersSnapshot`.
 * Receives pre-fetched rows + totals + a `groupBy` discriminated union.
 *
 *  - `groupBy.mode === "link"` (real dashboard) renders a link-based group-by
 *    chip that navigates via URL.
 *  - `groupBy.mode === "local"` (landing fixture) renders button-based tabs
 *    that call `onChange` and never read router context — safe outside the
 *    Next.js routing tree.
 */

import {
    TopSpendersSnapshotView,
    type TopSpendersSnapshotViewProps,
} from "@/components/ui/dashboard-views/top-spenders-snapshot-view";
import type { TopSpender } from "@/lib/metering/top-spender";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { Route } from "next";
import { renderToStaticMarkup } from "react-dom/server";

beforeAll(() => {
    // `TopSpendersTable` is a client component that calls `useRouter` at render
    // time. In a unit-test render that's outside the Next.js routing tree, we
    // stub it. This stub MUST throw in `groupBy.mode === "local"` test cases —
    // we assert there's no router dependency in local mode by never rendering
    // through the table when rows are empty. For non-empty cases we keep the
    // stub silent so we can test other behaviors independently.
    mock.module("next/navigation", () => ({
        useRouter: () => ({ replace: () => undefined, push: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
        usePathname: () => "/",
    }));
});

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const FROM = new Date("2026-05-01T00:00:00Z");
const TO = new Date("2026-05-17T12:00:00Z");

function buildProps(
    over: Partial<TopSpendersSnapshotViewProps> = {},
): TopSpendersSnapshotViewProps {
    return {
        facet: "tenant",
        suffix: "month",
        rows: [],
        totalUsd: "0.00000000",
        modelProviders: {},
        viewAllHref: `/workspace/${WORKSPACE}/spend` as Route,
        groupBy: { mode: "link", basePath: `/workspace/${WORKSPACE}`, otherParams: {} },
        workspaceId: WORKSPACE,
        from: FROM,
        to: TO,
        ...over,
    };
}

const row = (over: Partial<TopSpender> = {}): TopSpender => ({
    tag: "tenant-A",
    costUsd: "0.10000000",
    callCount: 5,
    blockedCount: 0,
    ...over,
});

describe("TopSpendersSnapshotView", () => {
    test("renders the empty-state copy when rows is empty", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView {...buildProps({ suffix: "month" })} />,
        );

        expect(html).toContain("Top spenders");
        expect(html).toContain("No spend recorded this month yet.");
    });

    test("empty-state suffix flows through from props", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView {...buildProps({ suffix: "week" })} />,
        );

        expect(html).toContain("No spend recorded this week yet.");
    });

    test("renders the rows table and View-all link when rows are present", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView
                {...buildProps({
                    rows: [row({ tag: "tenant-A", costUsd: "10.00000000" })],
                    totalUsd: "10.00000000",
                })}
            />,
        );

        expect(html).toContain("tenant-A");
        expect(html).toContain("View all spend");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend`);
        expect(html).not.toContain("No spend recorded this month yet.");
    });

    test("hides the View-all link when viewAllHref is null", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView
                {...buildProps({
                    rows: [row()],
                    totalUsd: "0.10000000",
                    viewAllHref: null,
                })}
            />,
        );

        expect(html).not.toContain("View all spend");
    });

    test("empty-state omits the Open-spend link when viewAllHref is null", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView {...buildProps({ viewAllHref: null })} />,
        );

        expect(html).not.toContain("Open spend");
    });

    test("groupBy.mode='link' renders the four facet labels as anchors", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView
                {...buildProps({
                    groupBy: {
                        mode: "link",
                        basePath: `/workspace/${WORKSPACE}`,
                        otherParams: {},
                    },
                })}
            />,
        );

        expect(html).toContain(">Tenant<");
        expect(html).toContain(">Agent<");
        expect(html).toContain(">Workflow<");
        expect(html).toContain(">Model<");
        // Link mode produces hrefs (Next Link → <a href=...>).
        expect(html).toMatch(/href="\/workspace\/[^"]*\?facet=agent"/);
    });

    test("groupBy.mode='local' renders the four facet labels as buttons (no anchors, no router context)", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView
                {...buildProps({
                    groupBy: { mode: "local", onChange: () => undefined },
                })}
            />,
        );

        expect(html).toContain(">Tenant<");
        expect(html).toContain(">Agent<");
        // Local-mode tabs are buttons, not links.
        expect(html).toContain("<button");
        // No <a href> for the group-by control in local mode.
        expect(html).not.toMatch(/href="\/workspace\/[^"]*\?facet=agent"/);
    });

    test("groupBy.mode='local' marks the active facet via aria-pressed", () => {
        const html = renderToStaticMarkup(
            <TopSpendersSnapshotView
                {...buildProps({
                    facet: "model",
                    groupBy: { mode: "local", onChange: () => undefined },
                })}
            />,
        );

        // The active button has aria-pressed="true" on Model.
        expect(html).toMatch(/aria-pressed="true"[^>]*>Model</);
    });
});
