/**
 * CloudPaywall — the upgrade state a locked cloud workspace sees instead of
 * real data. Blurred placeholder shapes imply data behind the gate (never real
 * numbers; the server short-circuits before fetching). Only the owner gets the
 * Subscribe CTA — a member can't unlock the workspace, so they see an "ask the
 * owner" note instead.
 *
 * Pure presentational component; this suite renders it to static markup and
 * asserts on the visible copy + the owner/member branch.
 */

import { CloudPaywall } from "@/components/ui/workspace/cloud-paywall";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const FEATURES = ["Live spend by customer, agent, and model", "Hard budget limits"] as const;
const noop = async () => undefined;

function ownerMarkup(): string {
    return renderToStaticMarkup(
        <CloudPaywall
            isOwner
            price="$29"
            interval="month"
            features={FEATURES}
            checkoutAction={noop}
        />,
    );
}

describe("CloudPaywall", () => {
    test("owner sees the locked upgrade card with price, bullets, and Subscribe CTA", () => {
        const html = ownerMarkup();
        expect(html).toContain("Dashboard locked");
        expect(html).toContain("Unlock your dashboard");
        expect(html).toContain("Subscribe to Cloud");
        expect(html).toContain("$29");
        expect(html).toContain("month");
        expect(html).toContain("Live spend by customer, agent, and model");
    });

    test("owner gets a Manage billing link to the account billing page", () => {
        // Billing is account-level, so it lives on its own /billing route, not in
        // workspace settings.
        expect(ownerMarkup()).toContain(`href="/billing"`);
    });

    test("a non-owner is told to ask the owner, with no Subscribe CTA", () => {
        const html = renderToStaticMarkup(
            <CloudPaywall isOwner={false} price="$29" interval="month" features={FEATURES} />,
        );
        expect(html).toContain("Ask the workspace owner");
        expect(html).not.toContain("Subscribe to Cloud");
    });

    test("falls back to default bullets when none are supplied", () => {
        const html = renderToStaticMarkup(
            <CloudPaywall
                isOwner
                price="$29"
                interval="month"
                features={[]}
                checkoutAction={noop}
            />,
        );
        expect(html).toContain("Spike alerts");
    });

    test("renders blurred placeholder shapes, not real data", () => {
        expect(ownerMarkup()).toContain("blur-");
    });

    test("carries dark-mode variants", () => {
        expect(ownerMarkup()).toContain("dark:");
    });
});
