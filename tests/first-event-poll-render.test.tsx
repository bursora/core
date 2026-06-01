/**
 * Render-side tests for the first-event poll strip.
 *
 *   - FirstEventStatus(received: false) → waiting: spinner + "waiting", with the
 *     spinner animation disabled under prefers-reduced-motion (motion-reduce
 *     utility) and the status text marked aria-live="polite".
 *   - FirstEventStatus(received: true) → "First event received", aria-live still
 *     polite so screen readers announce the flip without a reload.
 *   - FirstEventPoll mounts in the waiting state before any poll resolves.
 *
 * Effects (the poll loop) do not run under renderToStaticMarkup, so the mounted
 * component renders its initial waiting markup deterministically.
 */

import { FirstEventPoll, FirstEventStatus } from "@/components/ui/first-event-poll";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

describe("FirstEventStatus", () => {
    test("waiting state shows a reduced-motion-aware spinner and aria-live text", () => {
        const html = renderToStaticMarkup(<FirstEventStatus received={false} />);
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain("waiting");
        expect(html).toContain("animate-spin");
        expect(html).toContain("motion-reduce:animate-none");
    });

    test("received state announces the first event without a reload", () => {
        const html = renderToStaticMarkup(<FirstEventStatus received={true} />);
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain("First event received");
        expect(html).not.toContain("animate-spin");
    });
});

describe("FirstEventPoll", () => {
    test("mounts in the waiting state before the first poll resolves", () => {
        const html = renderToStaticMarkup(
            <FirstEventPoll workspaceId="11111111-2222-3333-4444-555555555555" />,
        );
        expect(html).toContain("waiting");
        expect(html).toContain('aria-live="polite"');
    });
});
