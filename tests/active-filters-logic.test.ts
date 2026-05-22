import {
    computeAddableDimensions,
    computeVisibleDimensions,
} from "@/components/ui/workspace/filters/active-filters-logic";
import { describe, expect, test } from "bun:test";

const DIMS = ["provider", "tenant_id", "agent_id", "workflow_id", "model"] as const;
type Dim = (typeof DIMS)[number];

describe("computeVisibleDimensions", () => {
    test("only active dimensions render when nothing is promoted", () => {
        const active = new Set<Dim>(["model", "tenant_id"]);
        const visible = computeVisibleDimensions(DIMS, (d) => active.has(d), null);
        expect([...visible]).toEqual(["tenant_id", "model"]);
    });

    test("promoted dimension renders alongside active ones", () => {
        const active = new Set<Dim>(["model"]);
        const visible = computeVisibleDimensions(DIMS, (d) => active.has(d), "agent_id");
        expect([...visible]).toEqual(["agent_id", "model"]);
    });

    test("promoted dimension that is also active appears once, in registry order", () => {
        const active = new Set<Dim>(["model", "provider"]);
        const visible = computeVisibleDimensions(DIMS, (d) => active.has(d), "model");
        expect([...visible]).toEqual(["provider", "model"]);
    });

    test("empty when nothing active and nothing promoted", () => {
        const visible = computeVisibleDimensions(DIMS, () => false, null);
        expect([...visible]).toEqual([]);
    });
});

describe("computeAddableDimensions", () => {
    test("lists dimensions that aren't visible, in registry order", () => {
        const visible: readonly Dim[] = ["tenant_id", "model"];
        const addable = computeAddableDimensions(DIMS, visible);
        expect([...addable]).toEqual(["provider", "agent_id", "workflow_id"]);
    });

    test("empty when every dimension is visible", () => {
        const addable = computeAddableDimensions(DIMS, DIMS);
        expect([...addable]).toEqual([]);
    });

    test("all dimensions addable when none visible", () => {
        const addable = computeAddableDimensions(DIMS, []);
        expect([...addable]).toEqual([...DIMS]);
    });
});
