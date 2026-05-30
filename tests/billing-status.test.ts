/**
 * Shared subscription-status vocabulary. The billing UI and the view-paywall
 * lock check both read this, so the active set lives in one place. This suite
 * pins the active/inactive split so a future provider-status change can't
 * silently drift the two callers apart.
 */

import { ACTIVE_SUBSCRIPTION_STATUSES, isActiveSubscriptionStatus } from "@/lib/billing-status";
import { describe, expect, test } from "bun:test";

describe("isActiveSubscriptionStatus", () => {
    test.each(["active", "past_due", "unpaid"])("%s grants access", (status) => {
        expect(isActiveSubscriptionStatus(status)).toBe(true);
    });

    test.each(["cancelled", "expired", "paused", "", "ACTIVE"])(
        "%s does not grant access",
        (status) => {
            expect(isActiveSubscriptionStatus(status)).toBe(false);
        },
    );

    test("null and undefined do not grant access", () => {
        expect(isActiveSubscriptionStatus(null)).toBe(false);
        expect(isActiveSubscriptionStatus(undefined)).toBe(false);
    });
});

describe("ACTIVE_SUBSCRIPTION_STATUSES", () => {
    test("is exactly the late-payment-tolerant active set", () => {
        expect([...ACTIVE_SUBSCRIPTION_STATUSES].sort()).toEqual(["active", "past_due", "unpaid"]);
    });
});
