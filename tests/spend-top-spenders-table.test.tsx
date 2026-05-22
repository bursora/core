/**
 * Tests for the /spend Top spenders table, focused on the new `status`-aware
 * behavior:
 *   - `status='blocked'` shows a Blocked column and ranks by it.
 *   - `status='both'` shows a Blocked column alongside Cost.
 *   - `status='ok'` (default) keeps the historical Cost layout.
 */

import { TopSpendersTable } from "@/components/ui/dashboard-views/top-spenders-table";
import type { TopSpender } from "@/lib/metering/top-spender";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

beforeAll(() => {
    mock.module("next/navigation", () => ({
        useRouter: () => ({ push: () => undefined, replace: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
        usePathname: () => "/",
    }));
});

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const FROM = new Date("2025-05-10T00:00:00Z");
const TO = new Date("2025-05-10T23:59:00Z");

const row = (over: Partial<TopSpender> = {}): TopSpender => ({
    tag: "tenant-A",
    costUsd: "0.10000000",
    callCount: 5,
    blockedCount: 0,
    ...over,
});

describe("TopSpendersTable — status filter", () => {
    test("status='ok' (default) does not render a Blocked column", () => {
        const html = renderToStaticMarkup(
            <TopSpendersTable
                rows={[row()]}
                totalUsd="0.10000000"
                workspaceId={WORKSPACE}
                facet="tenant"
                from={FROM}
                to={TO}
                status="ok"
            />,
        );

        expect(html).not.toContain(">Blocked<");
    });

    test("status='blocked' renders a Blocked column", () => {
        const html = renderToStaticMarkup(
            <TopSpendersTable
                rows={[row({ blockedCount: 7 })]}
                totalUsd="0.10000000"
                workspaceId={WORKSPACE}
                facet="tenant"
                from={FROM}
                to={TO}
                status="blocked"
            />,
        );

        expect(html).toContain(">Blocked<");
        expect(html).toContain(">7<");
    });

    test("status='both' renders a Blocked column", () => {
        const html = renderToStaticMarkup(
            <TopSpendersTable
                rows={[row({ blockedCount: 3 })]}
                totalUsd="0.10000000"
                workspaceId={WORKSPACE}
                facet="tenant"
                from={FROM}
                to={TO}
                status="both"
            />,
        );

        expect(html).toContain(">Blocked<");
    });
});

describe("TopSpendersTable — linkScope opt-out", () => {
    test("linkScope=false drops the row cursor-pointer affordance", () => {
        const html = renderToStaticMarkup(
            <TopSpendersTable
                rows={[row({ tag: "tenant-A" })]}
                totalUsd="0.10000000"
                workspaceId={WORKSPACE}
                facet="tenant"
                from={FROM}
                to={TO}
                linkScope={false}
            />,
        );

        expect(html).not.toContain("cursor-pointer");
        expect(html).not.toMatch(/aria-label="Filter spend to/);
    });

    test("linkScope defaults to true (rows clickable)", () => {
        const html = renderToStaticMarkup(
            <TopSpendersTable
                rows={[row({ tag: "tenant-A" })]}
                totalUsd="0.10000000"
                workspaceId={WORKSPACE}
                facet="tenant"
                from={FROM}
                to={TO}
            />,
        );

        expect(html).toContain("cursor-pointer");
    });
});
