/**
 * Render-absence contract for the dashboard "Trajectories to watch" panel.
 *
 * The panel is conditional: when both customer and model arrays are empty,
 * it renders nothing — no card, no header, no "all clear" message. Just
 * absent. This guards against accidental empty-state cards leaking into the
 * dashboard.
 */

import type {
    CustomerTrajectory,
    ModelTrajectory,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/trajectories";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

describe("TrajectoriesToWatchPanel absence contract", () => {
    test("returns null when both arrays are empty (no markup)", async () => {
        const { TrajectoriesToWatchPanel } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/_components/trajectories-to-watch");

        const html = renderToStaticMarkup(
            TrajectoriesToWatchPanel({
                workspaceId: WORKSPACE,
                customer: [],
                model: [],
            }),
        );

        expect(html).toBe("");
    });

    test("renders a card when at least one item exists", async () => {
        const { TrajectoriesToWatchPanel } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/_components/trajectories-to-watch");

        const customer: CustomerTrajectory[] = [
            {
                tenantId: "tenant-A",
                ratio: 3.0,
                etaDate: new Date("2025-05-12T08:00:00Z"),
                budgetId: "bud-A",
                budgetPeriod: "monthly",
            },
        ];

        const html = renderToStaticMarkup(
            TrajectoriesToWatchPanel({
                workspaceId: WORKSPACE,
                customer,
                model: [],
            }),
        );

        expect(html).toContain("tenant-A");
        expect(html).toContain("3");
        expect(html).toContain("monthly");
        // Action links to the budgets list page (inline edit lives there).
        expect(html).toContain(`/workspace/${WORKSPACE}/budgets`);
        expect(html).toContain("Raise cap");
    });

    test("renders model items with spend-by-model link", async () => {
        const { TrajectoriesToWatchPanel } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/_components/trajectories-to-watch");

        const model: ModelTrajectory[] = [
            {
                model: "gpt-4o",
                shareNow: 0.625,
                sharePrior: 0.3,
                cpcRatio: 2.0,
            },
        ];

        const html = renderToStaticMarkup(
            TrajectoriesToWatchPanel({
                workspaceId: WORKSPACE,
                customer: [],
                model,
            }),
        );

        expect(html).toContain("gpt-4o");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend`);
        expect(html).toContain("facet=model");
    });

    test("caps total items at 5; customer trajectories first", async () => {
        const { TrajectoriesToWatchPanel } =
            await import("@/app/(dashboard)/workspace/[workspaceId]/_components/trajectories-to-watch");

        const customer: CustomerTrajectory[] = Array.from({ length: 6 }, (_, i) => ({
            tenantId: `tenant-${i}`,
            ratio: 3.0,
            etaDate: new Date(`2025-05-${(12 + i).toString().padStart(2, "0")}T00:00:00Z`),
            budgetId: `bud-${i}`,
            budgetPeriod: "monthly",
        }));
        const model: ModelTrajectory[] = [
            {
                model: "gpt-4o",
                shareNow: 0.625,
                sharePrior: 0.3,
                cpcRatio: 2.0,
            },
        ];

        const html = renderToStaticMarkup(
            TrajectoriesToWatchPanel({
                workspaceId: WORKSPACE,
                customer,
                model,
            }),
        );

        // Five customers shown, sixth and the model trimmed.
        expect(html).toContain("tenant-0");
        expect(html).toContain("tenant-4");
        expect(html).not.toContain("tenant-5");
        expect(html).not.toContain("gpt-4o");
    });
});
