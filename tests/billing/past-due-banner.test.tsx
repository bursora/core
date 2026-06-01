/**
 * PastDueBanner — warning banner that surfaces on the settings billing
 * panel when the account subscription is `past_due` (after a
 * payment.failed webhook). Links into the LS billing portal so the
 * owner can update their payment method.
 *
 * The component is a pure presentational React node; this suite renders
 * it to static markup and asserts on the visible copy + portal action
 * form. The portal action keys to the signed-in user, so the banner
 * carries no workspace id.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { installSelfHostEnv } from "../support/with-self-host-env";

installSelfHostEnv();

// Imported inside each test, after installSelfHostEnv's beforeEach has set the
// self-host baseline. The EE component's transitive `env()` (via lib/auth)
// runs eagerly on first import, so the env must exist before that import.
const loadBanner = async () => (await import("@/lib/ee/components/past-due-banner")).PastDueBanner;

describe("PastDueBanner", () => {
    test("renders a warning alert flagging the failed payment", async () => {
        const PastDueBanner = await loadBanner();
        const html = renderToStaticMarkup(<PastDueBanner />);

        expect(html).toContain("Payment failed");
        expect(html).toMatch(/role="alert"/);
        // Warning variant from the Alert primitive.
        expect(html).toContain("bg-warning");
    });

    test("renders the billing portal action prompt", async () => {
        const PastDueBanner = await loadBanner();
        const html = renderToStaticMarkup(<PastDueBanner />);

        expect(html).toContain("<form");
        expect(html).toContain("Update payment method");
    });
});
