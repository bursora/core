/**
 * FacetTabs — borderless underline tabs for switching facets. Supports two
 * modes:
 *
 *  - `link` (routed) — renders each tab as a Next.js Link to the computed
 *    href. Server-renderable.
 *  - `local` (callback) — renders each tab as a button that fires `onChange`.
 *    Safe outside the Next.js routing tree (used by the landing fixture).
 */

import { FacetTabs } from "@/components/ui/workspace/filters/facet-tabs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

describe("FacetTabs link mode", () => {
    test("renders the four facet labels", () => {
        const html = renderToStaticMarkup(
            <FacetTabs
                facet="tenant"
                mode={{ kind: "link", basePath: "/workspace/abc", otherParams: {} }}
            />,
        );

        expect(html).toContain(">Tenant<");
        expect(html).toContain(">Agent<");
        expect(html).toContain(">Workflow<");
        expect(html).toContain(">Model<");
    });

    test("renders facet hrefs (non-default facets get ?facet=...)", () => {
        const html = renderToStaticMarkup(
            <FacetTabs
                facet="tenant"
                mode={{ kind: "link", basePath: "/workspace/abc", otherParams: {} }}
            />,
        );

        expect(html).toMatch(/href="\/workspace\/abc\?facet=agent"/);
    });

    test("marks the active facet as aria-pressed", () => {
        const html = renderToStaticMarkup(
            <FacetTabs
                facet="model"
                mode={{ kind: "link", basePath: "/workspace/abc", otherParams: {} }}
            />,
        );

        expect(html).toMatch(/aria-pressed="true"[^>]*>Model</);
    });
});

describe("FacetTabs local mode", () => {
    test("renders the four facet labels as buttons (no anchors)", () => {
        const html = renderToStaticMarkup(
            <FacetTabs facet="tenant" mode={{ kind: "local", onChange: () => undefined }} />,
        );

        expect(html).toContain(">Tenant<");
        expect(html).toContain("<button");
        expect(html).not.toMatch(/href="[^"]*\?facet=agent"/);
    });

    test("marks the active facet as aria-pressed", () => {
        const html = renderToStaticMarkup(
            <FacetTabs facet="agent" mode={{ kind: "local", onChange: () => undefined }} />,
        );

        expect(html).toMatch(/aria-pressed="true"[^>]*>Agent</);
    });
});
