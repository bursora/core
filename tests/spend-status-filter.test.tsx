/**
 * StatusFilter — segmented control on `/spend` that toggles the `status`
 * URL param between `ok`, `blocked`, and `both`.
 *
 * Server-renderable so the page can ship it without a client-state boundary.
 * Each option is a `<Link>` that preserves the other URL params and sets
 * (or omits, for default) the `status` key.
 */

import { StatusFilter } from "@/components/ui/workspace/filters/status-filter";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const BASE_PATH = "/workspace/ws-a/spend";

describe("StatusFilter", () => {
    test("renders three options labeled OK / Blocked / Both", () => {
        const html = renderToStaticMarkup(<StatusFilter status="ok" basePath={BASE_PATH} />);

        expect(html).toContain("OK");
        expect(html).toContain("Blocked");
        expect(html).toContain("Both");
    });

    test("marks the active option with aria-pressed=true", () => {
        const html = renderToStaticMarkup(<StatusFilter status="blocked" basePath={BASE_PATH} />);

        // The Blocked option must be flagged as active.
        const blockedMatch = html.match(/>Blocked</);
        expect(blockedMatch).not.toBeNull();
        // The active link carries aria-current="page" so screen readers and
        // tests can disambiguate which segment is selected.
        expect(html).toMatch(/aria-current="page"[^>]*>Blocked</);
    });

    test("links preserve other URL params and set status", () => {
        const html = renderToStaticMarkup(
            <StatusFilter
                status="ok"
                basePath={BASE_PATH}
                otherParams={{ from: "2025-05-01", facet: "tenant" }}
            />,
        );

        expect(html).toContain("status=blocked");
        expect(html).toContain("status=both");
        expect(html).toContain("from=2025-05-01");
        expect(html).toContain("facet=tenant");
    });

    test("OK option omits the status param (preserves the default URL shape)", () => {
        const html = renderToStaticMarkup(
            <StatusFilter
                status="blocked"
                basePath={BASE_PATH}
                otherParams={{ facet: "tenant" }}
            />,
        );

        // The OK option's href should not include status=ok — the default URL
        // for the dashboard has no status param at all.
        const okHrefMatch = html.match(/href="([^"]+)"[^>]*>OK</);
        expect(okHrefMatch).not.toBeNull();
        const okHref = okHrefMatch?.[1] ?? "";
        expect(okHref).not.toContain("status=");
        expect(okHref).toContain("facet=tenant");
    });
});
