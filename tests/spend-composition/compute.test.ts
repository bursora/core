import { composeSpend, type RawCompositionRow } from "@/lib/spend-composition";
import { describe, expect, test } from "bun:test";

describe("composeSpend", () => {
    test("empty input yields empty result", () => {
        expect(composeSpend([], 3)).toEqual([]);
    });

    test("groups rows by tenant and sums cost across models", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "acme", model: "gpt-4o", costUsd: 60 },
            { tenantId: "acme", model: "gpt-4o", costUsd: 20 },
            { tenantId: "acme", model: "claude-opus", costUsd: 10 },
        ];
        const out = composeSpend(rows, 3);
        expect(out).toHaveLength(1);
        expect(out[0]!.tenantId).toBe("acme");
        expect(out[0]!.totalCostUsd).toBe(90);
        expect(out[0]!.models).toEqual([
            { model: "gpt-4o", costUsd: 80, share: 80 / 90 },
            { model: "claude-opus", costUsd: 10, share: 10 / 90 },
        ]);
    });

    test("returns top-N tenants sorted by total descending", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "small", model: "gpt-4o-mini", costUsd: 5 },
            { tenantId: "big", model: "gpt-4o", costUsd: 100 },
            { tenantId: "mid", model: "claude-sonnet", costUsd: 50 },
        ];
        const out = composeSpend(rows, 2);
        expect(out.map((c) => c.tenantId)).toEqual(["big", "mid"]);
    });

    test("model rows inside a tenant are sorted by cost descending", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "acme", model: "haiku", costUsd: 5 },
            { tenantId: "acme", model: "opus", costUsd: 40 },
            { tenantId: "acme", model: "sonnet", costUsd: 20 },
        ];
        const [customer] = composeSpend(rows, 1);
        expect(customer!.models.map((m) => m.model)).toEqual(["opus", "sonnet", "haiku"]);
    });

    test("share values sum to ~1 within a customer", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "acme", model: "a", costUsd: 33 },
            { tenantId: "acme", model: "b", costUsd: 33 },
            { tenantId: "acme", model: "c", costUsd: 34 },
        ];
        const [customer] = composeSpend(rows, 1);
        const total = customer!.models.reduce((s, m) => s + m.share, 0);
        expect(total).toBeCloseTo(1, 5);
    });

    test("zero-cost rows are dropped", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "acme", model: "gpt-4o", costUsd: 0 },
            { tenantId: "acme", model: "claude-opus", costUsd: 5 },
        ];
        const [customer] = composeSpend(rows, 1);
        expect(customer!.models.map((m) => m.model)).toEqual(["claude-opus"]);
    });

    test("negative cost rows are dropped", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "acme", model: "x", costUsd: -10 },
            { tenantId: "acme", model: "y", costUsd: 5 },
        ];
        const [customer] = composeSpend(rows, 1);
        expect(customer!.models.map((m) => m.model)).toEqual(["y"]);
    });

    test("topN larger than tenant count returns all tenants", () => {
        const rows: RawCompositionRow[] = [
            { tenantId: "a", model: "m", costUsd: 10 },
            { tenantId: "b", model: "m", costUsd: 5 },
        ];
        expect(composeSpend(rows, 99)).toHaveLength(2);
    });
});
