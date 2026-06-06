/**
 * Render-side tests for the setup wizard's plan step ⓪.
 *
 *   - default: the plan card shows the DB-sourced price + features and the
 *     "Subscribe to Cloud" control; the step is mandatory, so there's no skip.
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
    monthly: { price: "$29", interval: "month" },
    annual: { price: "$290", interval: "year" },
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
            returnedActive={opts.returnedActive ?? false}
            awaitingActivation={opts.awaitingActivation ?? false}
            nextPath={"/workspace/new" as never}
        />,
    );
}

describe("PlanStep", () => {
    test("default state shows the DB plan, the interval toggle, and the subscribe control, no skip", async () => {
        const html = await render();
        expect(html).toContain("Bursora Cloud");
        expect(html).toContain("$29");
        expect(html).toContain("5M events / month");
        expect(html).toContain("Subscribe to Cloud");
        // Monthly/annual toggle with the annual savings nudge.
        expect(html).toContain("Monthly");
        expect(html).toContain("Annual");
        expect(html).toContain("2 months free");
        // The chosen interval rides to the action via a hidden field.
        expect(html).toContain('name="interval"');
        expect(html).not.toContain("Skip for now");
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
