/**
 * SpendCompositionPanel — pure presentational view for the "Where it goes" card.
 *
 * Real dashboard passes a routed `viewAllHref`; landing passes `null` to drop
 * the affordance entirely.
 */

import { SpendCompositionPanel } from "@/components/ui/dashboard-views/spend-composition-panel";
import type { CustomerComposition } from "@/lib/spend-composition";
import { describe, expect, test } from "bun:test";
import type { Route } from "next";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const rows: readonly CustomerComposition[] = [
    {
        tenantId: "acme",
        totalCostUsd: 100,
        models: [
            { model: "gpt-4o", costUsd: 70, share: 0.7 },
            { model: "claude-sonnet-4", costUsd: 30, share: 0.3 },
        ],
    },
];

describe("SpendCompositionPanel viewAllHref", () => {
    test("renders the 'View all spend' link when viewAllHref is provided", () => {
        const html = renderToStaticMarkup(
            <SpendCompositionPanel
                rows={rows}
                windowLabel="Month"
                viewAllHref={`/workspace/${WORKSPACE}/spend` as Route}
            />,
        );

        expect(html).toContain("View all spend");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend`);
    });

    test("omits the 'View all spend' link when viewAllHref is null", () => {
        const html = renderToStaticMarkup(
            <SpendCompositionPanel rows={rows} windowLabel="Month" viewAllHref={null} />,
        );

        expect(html).not.toContain("View all spend");
    });
});
