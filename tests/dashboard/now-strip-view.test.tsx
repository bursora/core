/**
 * NowStripView — pure presentational sibling of `NowStrip`. Receives the
 * pre-derived display data as plain props and renders the four-tile KPI grid.
 * No DB, no `await`, no server-only imports — so it's safe to call directly
 * from tests and from the landing-page fixture.
 */

import {
    NowStripView,
    type NowStripViewProps,
} from "@/components/ui/dashboard-views/now-strip-view";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

function buildProps(over: Partial<NowStripViewProps> = {}): NowStripViewProps {
    return {
        suffix: "month",
        deltaCaption: "vs prior month",
        spend: { total: 0, delta: 0, series: [] },
        calls: { count: 0, delta: 0, series: [] },
        budgets: { active: 0, deltaLabel: "none at 75%+", tone: "neut" },
        alerts: { total24h: 0, deltaLabel: "none raised", tone: "neut" },
        ...over,
    };
}

describe("NowStripView", () => {
    test("renders all four tile labels using the suffix prop", () => {
        const html = renderToStaticMarkup(<NowStripView {...buildProps()} />);

        expect(html).toContain("Spend, month");
        expect(html).toContain("Calls, month");
        expect(html).toContain("Active budgets");
        expect(html).toContain("Alerts, 24h");
    });

    test("formats the spend total as USD", () => {
        const html = renderToStaticMarkup(
            <NowStripView {...buildProps({ spend: { total: 1234.5, delta: 0, series: [] } })} />,
        );

        expect(html).toContain("$1,234.50");
    });

    test("formats the calls count with thousands separator", () => {
        const html = renderToStaticMarkup(
            <NowStripView {...buildProps({ calls: { count: 9876, delta: 0, series: [] } })} />,
        );

        expect(html).toContain("9,876");
    });

    test("uses up tone (destructive class) for positive spend delta", () => {
        const html = renderToStaticMarkup(
            <NowStripView {...buildProps({ spend: { total: 10, delta: 0.25, series: [] } })} />,
        );

        expect(html).toMatch(/Spend, month[\s\S]*?text-destructive/);
        expect(html).toContain("+25%");
    });

    test("uses down tone (success class) for negative spend delta", () => {
        const html = renderToStaticMarkup(
            <NowStripView {...buildProps({ spend: { total: 10, delta: -0.5, series: [] } })} />,
        );

        expect(html).toMatch(/Spend, month[\s\S]*?text-success/);
    });

    test("renders the deltaCaption suffix on the spend tile", () => {
        const html = renderToStaticMarkup(
            <NowStripView {...buildProps({ deltaCaption: "vs prior week" })} />,
        );

        expect(html).toContain("vs prior week");
    });

    test("renders the active budgets count and delta label", () => {
        const html = renderToStaticMarkup(
            <NowStripView
                {...buildProps({
                    budgets: { active: 3, deltaLabel: "1 at 75%+", tone: "up" },
                })}
            />,
        );

        expect(html).toMatch(/Active budgets[\s\S]*?\b3\b/);
        expect(html).toContain("1 at 75%+");
        expect(html).toMatch(/Active budgets[\s\S]*?text-destructive/);
    });

    test("renders alerts count and tone from props", () => {
        const html = renderToStaticMarkup(
            <NowStripView
                {...buildProps({
                    alerts: { total24h: 2, deltaLabel: "1 critical · 1 warning", tone: "up" },
                })}
            />,
        );

        expect(html).toMatch(/Alerts, 24h[\s\S]*?\b2\b/);
        expect(html).toContain("1 critical · 1 warning");
        expect(html).toMatch(/Alerts, 24h[\s\S]*?text-destructive/);
    });

    test("renders sparkline SVGs for the spend and calls tiles", () => {
        const html = renderToStaticMarkup(
            <NowStripView
                {...buildProps({
                    spend: { total: 10, delta: 0, series: [1, 2, 3] },
                    calls: { count: 10, delta: 0, series: [1, 2, 3] },
                })}
            />,
        );

        // Two SparkChart SVGs — one per tile.
        const svgMatches = html.match(/<svg/g) ?? [];
        expect(svgMatches.length).toBeGreaterThanOrEqual(2);
    });
});
