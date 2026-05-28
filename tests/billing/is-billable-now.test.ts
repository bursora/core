/**
 * `isWorkspaceBillableNow` is the single source of truth for "should the
 * monthly rollup invoice this workspace?". It exists so the spend
 * aggregator's SQL filter and the in-memory test fake agree, and so the
 * trial cutover rule is unit-testable without booting Postgres.
 *
 * Rules:
 *   - `active`, `past_due` → billable (provider already retried `past_due`;
 *                            the rollup still charges so the bill stays
 *                            current; LS handles dunning).
 *   - `trialing`           → billable only when `trial_ends_at` is null
 *                            (no trial window — preserves prior behavior)
 *                            OR `trial_ends_at <= now` (trial expired).
 *                            A trial still in progress is NOT billable.
 *   - anything else        → not billable (`canceled`, `expired`, `unpaid`,
 *                            `incomplete`, `incomplete_expired`, `null`).
 */

import { isWorkspaceBillableNow } from "@/lib/ee/billing/is-billable-now";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-02-01T00:00:00Z");

describe("isWorkspaceBillableNow", () => {
    test("active subscription is billable", () => {
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "active", trialEndsAt: null },
                NOW,
            ),
        ).toBe(true);
    });

    test("past_due subscription is billable", () => {
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "past_due", trialEndsAt: null },
                NOW,
            ),
        ).toBe(true);
    });

    test("trialing workspace with trial_ends_at in the future is NOT billable", () => {
        const oneDayLater = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "trialing", trialEndsAt: oneDayLater },
                NOW,
            ),
        ).toBe(false);
    });

    test("trialing workspace with trial_ends_at in the past IS billable", () => {
        const oneDayEarlier = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "trialing", trialEndsAt: oneDayEarlier },
                NOW,
            ),
        ).toBe(true);
    });

    test("trialing workspace with NULL trial_ends_at preserves current billable behavior", () => {
        // A trialing row that arrived without an explicit end date predates
        // trial tracking. Treating it as billable preserves the pre-migration
        // behavior so existing trialing rows aren't accidentally untouched
        // by the rollup. New trials carry trial_ends_at and gate correctly.
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "trialing", trialEndsAt: null },
                NOW,
            ),
        ).toBe(true);
    });

    test("canceled subscription is NOT billable", () => {
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "canceled", trialEndsAt: null },
                NOW,
            ),
        ).toBe(false);
    });

    test("expired subscription is NOT billable", () => {
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: "expired", trialEndsAt: null },
                NOW,
            ),
        ).toBe(false);
    });

    test("null subscription_status is NOT billable", () => {
        expect(
            isWorkspaceBillableNow(
                { subscriptionStatus: null, trialEndsAt: null },
                NOW,
            ),
        ).toBe(false);
    });
});
