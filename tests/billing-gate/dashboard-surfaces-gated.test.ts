/**
 * Every workspace DATA surface must apply the cloud view-paywall gate the same
 * way the overview page does (slice 1): a `cloudWorkspaceLocked` guard that
 * returns `CloudPaywall` BEFORE any real data is fetched, computed, or passed
 * to a client component.
 *
 * Full DOM render tests of these pages aren't feasible without stubbing the
 * entire data layer plus the Next request context (`await params`, sessions,
 * `db()`, a dozen `@/lib` server functions) — the slice-1 overview page shipped
 * none for the same reason. The security invariant that actually matters here
 * is structural: the gate has to run before the first data-fetch call. So this
 * suite reads each page's source and asserts gate-before-fetch, mirroring the
 * existing dark-audit suites that assert source-level properties.
 *
 * The lock decision itself (cloud vs self-host, active vs lapsed subscription)
 * is covered by `cloud-workspace-locked.test.ts`; the paywall view by
 * `cloud-paywall.test.tsx`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const WORKSPACE_DIR = join(REPO_ROOT, "app", "(dashboard)", "workspace", "[workspaceId]");

/** Page files that render real workspace data and therefore must be gated. */
const GATED_PAGES: string[] = [
    join(WORKSPACE_DIR, "spend", "page.tsx"),
    join(WORKSPACE_DIR, "budgets", "page.tsx"),
    join(WORKSPACE_DIR, "budgets", "[budgetId]", "page.tsx"),
    join(WORKSPACE_DIR, "alerts", "page.tsx"),
    join(WORKSPACE_DIR, "keys", "page.tsx"),
    join(WORKSPACE_DIR, "members", "page.tsx"),
];

// First real data read in each page. The gate must appear before this token so
// a locked workspace never triggers the fetch. Keyed by file for a precise,
// non-brittle "gate is upstream of the data" assertion per surface.
const FIRST_DATA_FETCH: Record<string, string> = {
    "spend/page.tsx": "getSpendSeries(",
    "budgets/page.tsx": "listBudgets(",
    "budgets/[budgetId]/page.tsx": "getBudget(",
    "alerts/page.tsx": "listDistinctMeteringValuesBulk(",
    "keys/page.tsx": "readIssuedKey(",
    "members/page.tsx": "listWorkspaceMembers(",
};

const read = (path: string): string => readFileSync(path, "utf8");

const relKey = (path: string): string => {
    const marker = `${WORKSPACE_DIR}/`;
    return path.slice(path.indexOf(marker) + marker.length);
};

describe("dashboard data surfaces are cloud-gated", () => {
    test.each(GATED_PAGES)("%s imports the gate and the paywall view", (path) => {
        const src = read(path);
        expect(src).toContain("cloudWorkspaceLocked");
        expect(src).toContain("@/lib/billing-gate/server");
        expect(src).toContain("CloudPaywallPage");
        expect(src).toContain("_components/cloud-paywall-page");
    });

    test.each(GATED_PAGES)("%s checks the lock before fetching any data", (path) => {
        const src = read(path);
        const fetchToken = FIRST_DATA_FETCH[relKey(path)];
        if (fetchToken === undefined) {
            throw new Error(`no first-data-fetch token registered for ${relKey(path)}`);
        }

        const gateIdx = src.indexOf("cloudWorkspaceLocked(");
        const fetchIdx = src.indexOf(fetchToken);

        expect(gateIdx).toBeGreaterThanOrEqual(0);
        expect(fetchIdx).toBeGreaterThanOrEqual(0);
        // Gate-before-fetch: the locked branch short-circuits upstream of the
        // first real read, so no workspace data is fetched for a locked user.
        expect(gateIdx).toBeLessThan(fetchIdx);
    });

    test.each(GATED_PAGES)("%s returns the paywall inside the locked branch", (path) => {
        const src = read(path);
        // The early return hands CloudPaywallPage the workspace id plus a static
        // title/subtitle — never fetched workspace data. CloudPaywallPage in turn
        // passes only workspaceId to the blur view (asserted below).
        expect(src).toMatch(/<CloudPaywallPage\b[\s\S]*?workspaceId=\{workspaceId\}/);
    });
});

describe("CloudPaywallPage hands the blur view only the workspace id", () => {
    test("passes only workspaceId to CloudPaywall", () => {
        const src = read(join(WORKSPACE_DIR, "_components", "cloud-paywall-page.tsx"));
        // Relocated from the per-page assertion: the actual blurred view still
        // receives only the workspace id, no fetched data.
        expect(src).toMatch(/<CloudPaywall\s+workspaceId=\{workspaceId\}\s*\/>/);
    });
});

describe("settings: activity gated, billing reachable when locked", () => {
    const src = read(join(WORKSPACE_DIR, "settings", "page.tsx"));

    test("the activity log tab is paywalled when locked", () => {
        // The activity log is real workspace data (incl. alert_raised rows), so
        // it renders the paywall when locked instead of fetching activity.
        expect(src).toContain("cloudWorkspaceLocked");
        expect(src).toMatch(/activity:\s*locked\s*\?/);
    });

    test("billing stays reachable so a locked user can subscribe", () => {
        // Billing must render whenever cloud, never behind the `locked` gate.
        expect(src).toContain("BillingSection");
    });
});

describe("every workspace page is gated unless allowlisted (fail-closed)", () => {
    // Coverage guard: a new page added under the workspace dir without the gate
    // must FAIL here rather than silently shipping un-paywalled. The explicit
    // allowlist is the only escape hatch, so ungating is a deliberate edit.
    const UNGATED = new Set(["settings/page.tsx"]);

    const pageFiles = readdirSync(WORKSPACE_DIR, { recursive: true })
        .map((p) => String(p).split("\\").join("/"))
        .filter((p) => p === "page.tsx" || p.endsWith("/page.tsx"));

    test("the directory scan found the known pages", () => {
        // Guards against a glob that silently matches nothing and passes vacuously.
        expect(pageFiles.length).toBeGreaterThanOrEqual(7);
    });

    test.each(pageFiles.filter((p) => !UNGATED.has(p)))("%s imports the cloud gate", (rel) => {
        const src = read(join(WORKSPACE_DIR, rel));
        expect(src).toContain("cloudWorkspaceLocked");
        expect(src).toContain("CloudPaywall");
    });
});

describe("workspace layout suppresses data banners when locked", () => {
    // The layout renders usage/rate-limit/notification banners around every
    // page. Those banners read real workspace data (event counts, API key
    // request rates, alert content), so a locked workspace must not see them —
    // the gate has to run before the banners render and wrap them in a
    // lock-conditional.
    const src = read(join(WORKSPACE_DIR, "layout.tsx"));

    test("layout computes the lock before rendering the banners", () => {
        const gateIdx = src.indexOf("cloudWorkspaceLocked(");
        // Assert against the FIRST banner (alert content) — it sits earliest in
        // the JSX, so gate-before-it implies gate-before all three.
        const firstBannerIdx = src.indexOf("<WorkspaceBannerNotifications");
        expect(src).toContain("@/lib/billing-gate/server");
        expect(gateIdx).toBeGreaterThanOrEqual(0);
        expect(firstBannerIdx).toBeGreaterThanOrEqual(0);
        expect(gateIdx).toBeLessThan(firstBannerIdx);
    });

    test("the banners render only on the unlocked branch", () => {
        // `locked ? null : (<banners/>)` — a locked workspace gets no banners.
        expect(src).toMatch(/locked\s*\?\s*null\s*:/);
    });
});
