/**
 * Optimistic budget list reducer.
 *
 * The dashboard uses `useOptimistic` to render new rows before the server
 * confirms. The reducer below is the pure core of that flow — these tests
 * cover immediate insert, immediate dimming on delete, and full rollback
 * on server error.
 */

import { optimisticReducer, pendingRowClass, type OptimisticItem } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";

interface Row extends OptimisticItem {
    readonly label: string;
}

const baseline: readonly Row[] = [{ id: "a", label: "Alpha", pending: "none" }];

describe("optimisticReducer (budgets create + delete)", () => {
    test("add inserts a creating row immediately", () => {
        const next = optimisticReducer<Row>(baseline, {
            kind: "add",
            item: { id: "b", label: "Beta", pending: "none" },
        });
        expect(next).toHaveLength(2);
        expect(next[1]).toEqual({ id: "b", label: "Beta", pending: "creating" });
    });

    test("remove flips an existing row to removing without dropping it", () => {
        const next = optimisticReducer<Row>(baseline, {
            kind: "remove",
            id: "a",
        });
        expect(next).toHaveLength(1);
        expect(next[0]?.pending).toBe("removing");
    });

    test("rollback-add drops the optimistic row on server error", () => {
        const withPending = optimisticReducer<Row>(baseline, {
            kind: "add",
            item: { id: "b", label: "Beta", pending: "none" },
        });
        const rolled = optimisticReducer<Row>(withPending, {
            kind: "rollback-add",
            id: "b",
        });
        expect(rolled).toEqual(baseline);
    });

    test("rollback-remove restores the row on server error", () => {
        const dimmed = optimisticReducer<Row>(baseline, {
            kind: "remove",
            id: "a",
        });
        const rolled = optimisticReducer<Row>(dimmed, {
            kind: "rollback-remove",
            id: "a",
        });
        expect(rolled[0]?.pending).toBe("none");
    });

    test("pendingRowClass dims pending rows and leaves confirmed rows alone", () => {
        expect(pendingRowClass("none")).toBe("");
        expect(pendingRowClass("creating")).toBe("opacity-50");
        expect(pendingRowClass("removing")).toBe("opacity-50");
    });
});
