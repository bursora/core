/**
 * Render-side tests for the setup wizard's plan step ⓪.
 *
 *   - default: the plan card shows the DB-sourced price + features and both the
 *     "Subscribe to Cloud" and "Skip for now" controls.
 *   - returned-active: collapses to a "Subscribed" confirmation and drops the
 *     subscribe control (the effect auto-advances; effects don't run under
 *     renderToStaticMarkup, so only the markup is asserted here).
 *   - finalizing: returned from checkout before the webhook landed — shows the
 *     polling "finalizing" panel, not the subscribe card.
 *
 * `useRouter` is mocked so the client component renders outside an App Router.
 */

import type { OnboardingPlanView } from "@/lib/onboarding/plan-view";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

beforeAll(() => {
    mock.module("next/navigation", () => ({
        useRouter: () => ({ push: () => undefined }),
    }));
});

const PLAN: OnboardingPlanView = {
    name: "Bursora Cloud",
    price: "$29",
    interval: "month",
    features: ["5M events / month"],
};

const noop = async () => undefined;

async function render(
    opts: { returnedActive?: boolean; awaitingActivation?: boolean } = {},
): Promise<string> {
    const { PlanStep } = await import("@/app/(dashboard)/workspace/new/_components/plan-step");
    return renderToStaticMarkup(
        <PlanStep
            plan={PLAN}
            checkoutAction={noop}
            skipAction={noop}
            returnedActive={opts.returnedActive ?? false}
            awaitingActivation={opts.awaitingActivation ?? false}
            nextPath={"/workspace/new" as never}
        />,
    );
}

describe("PlanStep", () => {
    test("default state shows the DB plan and both controls", async () => {
        const html = await render();
        expect(html).toContain("Bursora Cloud");
        expect(html).toContain("$29");
        expect(html).toContain("month");
        expect(html).toContain("5M events / month");
        expect(html).toContain("Subscribe to Cloud");
        expect(html).toContain("Skip for now");
    });

    test("returned-active collapses to a Subscribed confirmation", async () => {
        const html = await render({ returnedActive: true });
        expect(html).toContain("Subscribed");
        expect(html).not.toContain("Subscribe to Cloud");
        expect(html).toContain('role="status"');
    });

    test("finalizing state polls instead of re-showing the subscribe card", async () => {
        const html = await render({ awaitingActivation: true });
        expect(html).toContain("Finalizing your subscription");
        expect(html).not.toContain("Subscribe to Cloud");
        expect(html).toContain('role="status"');
    });
});
