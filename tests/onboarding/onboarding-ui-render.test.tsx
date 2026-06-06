/**
 * Render-side tests for the onboarding UI presentational pieces.
 *
 *   - WizardStepper marks earlier steps done (green check), the current step
 *     active (aria-current), and later steps pending/muted.
 *   - GettingStartedCard shows the count + progressbar, renders done rows as a
 *     green check, the first-event row as the live waiting strip, and remaining
 *     todos as links to their section.
 *
 * Server-action effects don't run under renderToStaticMarkup, so the dismiss
 * action is a no-op stub and the form renders deterministically.
 */

import { GettingStartedCard } from "@/app/(dashboard)/workspace/[workspaceId]/_components/getting-started-card";
import { WizardStepper } from "@/app/(dashboard)/workspace/new/_components/wizard-stepper";
import type { ActivationState } from "@/lib/onboarding/activation-state";
import { buildGettingStartedRows } from "@/lib/onboarding/getting-started-rows";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WS = "11111111-2222-3333-4444-555555555555";

describe("WizardStepper", () => {
    test("step 2 marks workspace done, api-key active, connect pending", () => {
        const html = renderToStaticMarkup(<WizardStepper current={2} showPlan />);
        expect(html).toContain("Workspace");
        expect(html).toContain("API key");
        expect(html).toContain("Connect");
        expect(html).toContain('aria-current="step"');
        // earlier step renders the green completed check
        expect(html).toContain("text-success");
        // later step is muted
        expect(html).toContain("text-muted-foreground/50");
    });

    test("cloud renders the plan step; self-host omits it", () => {
        expect(renderToStaticMarkup(<WizardStepper current={1} showPlan />)).toContain("Plan");
        expect(renderToStaticMarkup(<WizardStepper current={1} showPlan={false} />)).not.toContain(
            "Plan",
        );
    });

    test("a passed plan step reads as done (green check)", () => {
        const html = renderToStaticMarkup(<WizardStepper current={1} showPlan />);
        expect(html).toContain("Plan");
        expect(html).toContain("text-success");
    });
});

describe("GettingStartedCard", () => {
    const FRESH: ActivationState = {
        workspaceCreated: true,
        apiKeyIssued: false,
        firstEventSent: false,
        budgetSet: false,
        teammateInvited: false,
        dismissed: false,
    };
    const { rows, completed, total } = buildGettingStartedRows(FRESH, WS);
    const html = renderToStaticMarkup(
        <GettingStartedCard
            workspaceId={WS}
            rows={rows}
            completed={completed}
            total={total}
            dismissAction={async () => {}}
        />,
    );

    test("shows the completion count and a progressbar", () => {
        expect(html).toContain("1/5");
        expect(html).toContain('role="progressbar"');
        expect(html).toContain('aria-valuenow="1"');
        expect(html).toContain('aria-valuemax="5"');
    });

    test("done row renders a label, todo rows link to their section", () => {
        expect(html).toContain("Workspace created");
        expect(html).toContain(`/workspace/${WS}/keys`);
        expect(html).toContain(`/workspace/${WS}/budgets`);
        expect(html).toContain(`/workspace/${WS}/members`);
    });

    test("first-event row shows the live waiting strip", () => {
        expect(html).toContain("Send your first event");
        expect(html).toContain("waiting");
        expect(html).toContain("motion-reduce:animate-none");
    });

    test("dismiss control is labelled", () => {
        expect(html).toContain('aria-label="Dismiss getting started"');
    });
});
