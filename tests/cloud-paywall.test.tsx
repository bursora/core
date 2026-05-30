/**
 * CloudPaywall — the view-paywall a locked cloud workspace sees instead of
 * real data. It must render blurred placeholder shapes (never real numbers,
 * since the server short-circuits before fetching) plus a subscribe CTA that
 * links to Settings → Billing.
 *
 * Pure presentational component; this suite renders it to static markup and
 * asserts on the visible copy + the CTA target.
 */

import { CloudPaywall } from "@/components/ui/workspace/cloud-paywall";
import { buildWorkspacePath } from "@/lib/routes";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

describe("CloudPaywall", () => {
    test("renders the subscribe CTA with the flat price", () => {
        const html = renderToStaticMarkup(<CloudPaywall workspaceId={WORKSPACE_ID} />);
        expect(html).toContain("Subscribe to Bursora Cloud");
        expect(html).toContain("$29/mo");
    });

    test("links the CTA to the workspace billing settings", () => {
        const html = renderToStaticMarkup(<CloudPaywall workspaceId={WORKSPACE_ID} />);
        expect(html).toContain(`href="${buildWorkspacePath(WORKSPACE_ID, "settings")}"`);
    });

    test("renders blurred placeholder shapes, not real data", () => {
        const html = renderToStaticMarkup(<CloudPaywall workspaceId={WORKSPACE_ID} />);
        // Blur is what sells the "there is data behind this" idea without
        // leaking any. The skeleton shapes carry the blur class.
        expect(html).toContain("blur-");
    });

    test("carries dark-mode variants", () => {
        const html = renderToStaticMarkup(<CloudPaywall workspaceId={WORKSPACE_ID} />);
        expect(html).toContain("dark:");
    });
});
