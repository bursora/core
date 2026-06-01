/**
 * Render-side tests for the masked API-key cell.
 *
 * The masked state shows a Stripe-style suffix: `bsk_` + a fixed run of dots +
 * the non-secret `last6` hint. Legacy keys carry no hint (`last6` null), so the
 * cell falls back to the all-dots mask. Effects and the reveal action never run
 * under renderToStaticMarkup, so the initial masked markup is deterministic.
 *
 * The cell statically imports a server action that reads `next/headers`; the
 * test preload (`tests/server-only-shim.ts`) stubs that module so the import
 * resolves in the bun test env.
 */

import { RevealApiKeyCell } from "@/app/(dashboard)/workspace/[workspaceId]/keys/_components/reveal-api-key-cell";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const KEY_ID = "22222222-3333-4444-5555-666666666666";

describe("RevealApiKeyCell masked state", () => {
    test("renders the last6 suffix when the hint is present", () => {
        const html = renderToStaticMarkup(
            <RevealApiKeyCell
                keyId={KEY_ID}
                workspaceId={WORKSPACE}
                revealable={true}
                last6="a3b4c5"
            />,
        );
        expect(html).toContain("bsk_••••••••••••a3b4c5");
    });

    test("falls back to the all-dots mask when last6 is null", () => {
        const html = renderToStaticMarkup(
            <RevealApiKeyCell
                keyId={KEY_ID}
                workspaceId={WORKSPACE}
                revealable={true}
                last6={null}
            />,
        );
        expect(html).toContain("bsk_••••••••••••••••");
        expect(html).not.toContain("a3b4c5");
    });
});
