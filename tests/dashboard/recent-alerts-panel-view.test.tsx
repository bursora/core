/**
 * RecentAlertsPanelView — pure presentational view for the Recent alerts feed.
 *
 * The view is synchronous and accepts plain row data; it does not touch
 * `lib/detection`. These tests render it directly via React's static markup
 * renderer.
 */

import type { RecentAlertsRow } from "@/components/ui/dashboard-views/recent-alerts-panel-view";
import { RecentAlertsPanelView } from "@/components/ui/dashboard-views/recent-alerts-panel-view";
import { describe, expect, test } from "bun:test";
import type { Route } from "next";
import { renderToStaticMarkup } from "react-dom/server";

const href = (p: string): Route => p as Route;

const row = (over: Partial<RecentAlertsRow> = {}): RecentAlertsRow => ({
    key: over.key ?? "anomaly:1",
    timestamp: over.timestamp ?? "5m",
    kind: over.kind ?? "warn",
    who: over.who ?? "workspace",
    label: over.label ?? "spike",
});

describe("RecentAlertsPanelView", () => {
    test("renders the empty-state copy when rows is empty", () => {
        const html = renderToStaticMarkup(
            <RecentAlertsPanelView rows={[]} viewAllHref={href("/workspace/abc/alerts")} />,
        );

        expect(html).toContain("No alerts in the last 24 hours");
        expect(html).toContain("agents behaving");
    });

    test("renders 'View all →' link when viewAllHref is provided", () => {
        const html = renderToStaticMarkup(
            <RecentAlertsPanelView rows={[]} viewAllHref={href("/workspace/abc/alerts")} />,
        );

        expect(html).toContain("View all");
        expect(html).toContain('href="/workspace/abc/alerts"');
    });

    test("omits the 'View all →' link when viewAllHref is null", () => {
        const html = renderToStaticMarkup(<RecentAlertsPanelView rows={[]} viewAllHref={null} />);

        expect(html).not.toContain("View all");
    });

    test("renders each row's label, who, timestamp, and kind", () => {
        const html = renderToStaticMarkup(
            <RecentAlertsPanelView
                rows={[
                    row({
                        key: "a:1",
                        timestamp: "12m",
                        kind: "block",
                        who: "tenant_42",
                        label: "10x spike vs baseline",
                    }),
                ]}
                viewAllHref={null}
            />,
        );

        expect(html).toContain("12m");
        expect(html).toContain("text-destructive");
        expect(html).toContain("block");
        expect(html).toContain("tenant_42");
        expect(html).toContain("10x spike vs baseline");
    });

    test("maps kind 'warn' to the warning FeedItem styling", () => {
        const html = renderToStaticMarkup(
            <RecentAlertsPanelView
                rows={[row({ kind: "warn", label: "2x spike" })]}
                viewAllHref={null}
            />,
        );

        expect(html).toContain("text-warning");
        expect(html).toContain("warn");
        expect(html).toContain("2x spike");
    });

    test("preserves the order of rows (no client-side re-sort)", () => {
        const html = renderToStaticMarkup(
            <RecentAlertsPanelView
                rows={[
                    row({ key: "older", label: "older incident" }),
                    row({ key: "newer", label: "newer incident" }),
                ]}
                viewAllHref={null}
            />,
        );

        const olderAt = html.indexOf("older incident");
        const newerAt = html.indexOf("newer incident");
        expect(olderAt).toBeGreaterThan(-1);
        expect(newerAt).toBeGreaterThan(-1);
        expect(olderAt).toBeLessThan(newerAt);
    });
});
