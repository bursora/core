/**
 * Pricing feature integration test.
 *
 * Drives the public API exposed by `@/lib/metering/pricing` — the surface metering
 * and other consumers depend on. Uses an in-memory fake `PricingRepository`
 * (identical pattern to `tests/features/identity.test.ts`); the goal here is to
 * lock the feature folder's public contract: `lookup` selects correctly across
 * (provider, model, region, ts) including overlapping-rule resolution, and the
 * `pricing` table is re-exported.
 */

import {
    lookup,

    type PricingRepository,
    type PricingRow,
} from "@/lib/metering/pricing";
import { pricing as pricingTable } from "@/lib/db";
import { describe, expect, test } from "bun:test";

const baseRow = (overrides: Partial<PricingRow> = {}): PricingRow => ({
    id: "row-1",
    workspaceId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "0.0025",
    outputPer1mUsd: "0.01",
    cachePer1mUsd: "0.00125",
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
});

class InMemoryPricingRepository implements PricingRepository {
    private readonly rows: PricingRow[] = [];

    seed(row: PricingRow): void {
        this.rows.push(row);
    }

    async findLatestGlobal(): Promise<PricingRow | null> {
        throw new Error("unused");
    }
    async closeAndInsert(): Promise<void> {
        throw new Error("unused");
    }
    async insert(): Promise<void> {
        throw new Error("unused");
    }
    async insertOverride(): Promise<PricingRow> {
        throw new Error("unused");
    }
    async listOverridesByWorkspace(): Promise<readonly PricingRow[]> {
        throw new Error("unused");
    }
    async deleteOverride(): Promise<boolean> {
        throw new Error("unused");
    }
    async updateOverride(): Promise<PricingRow | null> {
        throw new Error("unused");
    }
    async findCandidatesForLookup(input: {
        provider: string;
        model: string;
        region: string;
        workspaceId: string;
    }): Promise<readonly PricingRow[]> {
        return this.rows.filter(
            (r) =>
                r.provider === input.provider &&
                r.model === input.model &&
                r.region === input.region &&
                (r.workspaceId === null || r.workspaceId === input.workspaceId),
        );
    }
    async findAllCandidatesForWorkspace(workspaceId: string): Promise<readonly PricingRow[]> {
        return this.rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId);
    }
}

describe("@/lib/metering/pricing public API", () => {
    test("schema table is re-exported", () => {
        expect(pricingTable).toBeDefined();
    });

    test("lookup returns null when no candidate matches", async () => {
        const repo = new InMemoryPricingRepository();
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result).toBeNull();
    });

    test("lookup returns the row whose [effectiveFrom, effectiveTo) contains ts", async () => {
        const repo = new InMemoryPricingRepository();
        repo.seed(
            baseRow({
                id: "old",
                effectiveFrom: new Date("2023-01-01T00:00:00Z"),
                effectiveTo: new Date("2024-01-01T00:00:00Z"),
            }),
        );
        repo.seed(
            baseRow({
                id: "current",
                effectiveFrom: new Date("2024-01-01T00:00:00Z"),
                effectiveTo: null,
            }),
        );
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2023-06-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result?.id).toBe("old");
    });

    test("workspace override wins over global at same ts", async () => {
        const repo = new InMemoryPricingRepository();
        repo.seed(baseRow({ id: "global", workspaceId: null }));
        repo.seed(baseRow({ id: "override", workspaceId: "ws-1" }));
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result?.id).toBe("override");
    });

    test("override for a different workspace falls back to global", async () => {
        const repo = new InMemoryPricingRepository();
        repo.seed(baseRow({ id: "global", workspaceId: null }));
        repo.seed(baseRow({ id: "other-override", workspaceId: "ws-2" }));
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result?.id).toBe("global");
    });

    test("overlapping rules in same scope: most recent effectiveFrom wins", async () => {
        const repo = new InMemoryPricingRepository();
        repo.seed(
            baseRow({
                id: "a",
                effectiveFrom: new Date("2024-01-01T00:00:00Z"),
                effectiveTo: new Date("2024-12-31T00:00:00Z"),
            }),
        );
        repo.seed(
            baseRow({
                id: "b",
                effectiveFrom: new Date("2024-02-01T00:00:00Z"),
                effectiveTo: new Date("2024-12-31T00:00:00Z"),
            }),
        );
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2024-03-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result?.id).toBe("b");
    });

    test("provider/model/region must match exactly", async () => {
        const repo = new InMemoryPricingRepository();
        repo.seed(baseRow({ id: "wrong-region", region: "us-east-1" }));
        repo.seed(baseRow({ id: "ok" }));
        const result = await lookup({
            pricing: repo,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(result?.id).toBe("ok");
    });
});
