/**
 * Unit tests for the GroupByFilter href builder. Covers the URL shape callers
 * rely on: default facet drops the param; other facets set it; preserved
 * params survive; `facet` and `scope_id` are stripped (scope id is bound to
 * the prior facet); undefined / empty values do not crash or leak.
 */

import { buildHref } from "@/components/ui/workspace/filters/group-by-filter";
import { describe, expect, test } from "bun:test";

describe("buildHref", () => {
    test("omits facet param when switching to the default (tenant)", () => {
        expect(String(buildHref("/w/foo/spend", undefined, "tenant"))).toBe("/w/foo/spend");
    });

    test("sets facet param for non-default facets", () => {
        expect(String(buildHref("/w/foo/spend", undefined, "model"))).toBe(
            "/w/foo/spend?facet=model",
        );
    });

    test("preserves other URL params", () => {
        const href = buildHref("/w/foo/spend", { window: "week" }, "agent");
        expect(String(href)).toBe("/w/foo/spend?window=week&facet=agent");
    });

    test("strips facet and scope_id from preserved params", () => {
        const href = buildHref(
            "/w/foo/spend",
            { facet: "tenant", scope_id: "abc", window: "week" },
            "agent",
        );
        expect(String(href)).toBe("/w/foo/spend?window=week&facet=agent");
    });

    test("drops undefined values without crashing", () => {
        const href = buildHref("/w/foo/spend", { status: undefined, window: "week" }, "model");
        expect(String(href)).toBe("/w/foo/spend?window=week&facet=model");
    });

    test("drops empty-string values", () => {
        const href = buildHref("/w/foo/spend", { window: "" }, "tenant");
        expect(String(href)).toBe("/w/foo/spend");
    });
});
