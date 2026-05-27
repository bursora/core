/**
 * PastDueBanner — warning banner that surfaces on the settings billing
 * panel when the workspace subscription is `past_due` (after a
 * payment.failed webhook). Links into the LS billing portal so the
 * owner can update their payment method.
 *
 * The component is a pure presentational React node; this suite renders
 * it to static markup and asserts on the visible copy + portal action
 * target. The portal entry point is rendered by `BillingSection` via a
 * server-action form, so the banner only needs to flag the workspace
 * id and prompt the user to use the existing Manage billing button.
 */

import { PastDueBanner } from "@/lib/ee/components/past-due-banner";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

describe("PastDueBanner", () => {
    test("renders a warning alert flagging the failed payment", () => {
        const html = renderToStaticMarkup(<PastDueBanner workspaceId={WORKSPACE_ID} />);

        expect(html).toContain("Payment failed");
        expect(html).toMatch(/role="alert"/);
        // Warning variant from the Alert primitive.
        expect(html).toContain("bg-warning");
    });

    test("links to the billing portal action with the workspace id", () => {
        const html = renderToStaticMarkup(<PastDueBanner workspaceId={WORKSPACE_ID} />);

        expect(html).toContain(`value="${WORKSPACE_ID}"`);
        expect(html).toContain("Update payment method");
    });
});
