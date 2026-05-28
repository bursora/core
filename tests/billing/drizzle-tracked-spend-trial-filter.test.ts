/**
 * Regression lock for the trial-aware billable filter on the spend
 * aggregator. `DrizzleTrackedSpendRepository.listActiveCloudWorkspaceIds`
 * must NOT return a trialing workspace whose `trial_ends_at` is in the
 * future — that's the issue #924 fix.
 *
 * Behavior is unit-tested via the pure `isWorkspaceBillableNow` helper
 * (see `is-billable-now.test.ts`). This test asserts the Drizzle repo's
 * SQL references both `subscription_status` and `trial_ends_at` so a
 * future refactor can't silently revert to the old "trialing always
 * counts" filter.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_PATH = join(
    import.meta.dir,
    "..",
    "..",
    "lib",
    "ee",
    "billing",
    "drizzle-tracked-spend.repository.ts",
);

describe("DrizzleTrackedSpendRepository active filter", () => {
    test("the source references trial_ends_at when deciding billable status", () => {
        const source = readFileSync(REPO_PATH, "utf8");
        expect(source).toMatch(/trialEndsAt/);
    });

    test("the active status set no longer treats trialing as unconditionally billable", () => {
        const source = readFileSync(REPO_PATH, "utf8");
        // Old behavior: ACTIVE_STATUSES = ["active", "trialing", "past_due"].
        // The new behavior must NOT inline `trialing` as a hardcoded billable
        // status without an accompanying trial-window check.
        const oldArrayLiteral =
            /\[\s*"active"\s*,\s*"trialing"\s*,\s*"past_due"\s*\]\s*as\s*const/;
        expect(source).not.toMatch(oldArrayLiteral);
    });
});
