/**
 * Tests for findPricingRow — pure helper that picks the row matching
 * (provider, model, region) where `ts` falls inside [effectiveFrom, effectiveTo).
 *
 * Policy under test:
 *   - Workspace-scoped override (workspaceId === ws) wins over global (null)
 *     when both candidates contain `ts`.
 *   - Overlapping ranges within the same scope: pick the row with the most
 *     recent effectiveFrom.
 *   - effectiveTo === null is treated as +Infinity (still effective).
 *   - No candidate contains `ts` → null.
 *   - Provider/model/region must match exactly.
 */

import { findPricingRow } from "@/lib/metering/pricing/find-pricing-row";
import type { PricingRow } from "@/lib/metering/pricing/pricing-row";
import { describe, expect, test } from "bun:test";

const row = (overrides: Partial<PricingRow> = {}): PricingRow => ({
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

describe("findPricingRow", () => {
    test("returns null when no candidates match the triple", () => {
        const found = findPricingRow({
            candidates: [],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found).toBeNull();
    });

    test("picks the only matching row when ts falls inside effectiveFrom..null", () => {
        const r = row({
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });
        const found = findPricingRow({
            candidates: [r],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("row-1");
    });

    test("returns null when ts is before effectiveFrom", () => {
        const r = row({
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });
        const found = findPricingRow({
            candidates: [r],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2023-12-31T23:59:59Z"),
            workspaceId: "ws-1",
        });
        expect(found).toBeNull();
    });

    test("returns null when ts is at or after effectiveTo", () => {
        const r = row({
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: new Date("2024-06-01T00:00:00Z"),
        });
        const found = findPricingRow({
            candidates: [r],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2024-06-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found).toBeNull();
    });

    test("uses the row that was effective AT ts, not the latest", () => {
        const old = row({
            id: "old",
            inputPer1mUsd: "0.001",
            effectiveFrom: new Date("2023-01-01T00:00:00Z"),
            effectiveTo: new Date("2024-01-01T00:00:00Z"),
        });
        const current = row({
            id: "current",
            inputPer1mUsd: "0.005",
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });
        const found = findPricingRow({
            candidates: [old, current],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2023-06-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("old");
    });

    test("workspace-scoped override beats global when both contain ts", () => {
        const global = row({ id: "global", workspaceId: null });
        const override = row({ id: "override", workspaceId: "ws-1" });
        const found = findPricingRow({
            candidates: [global, override],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("override");
    });

    test("override for a DIFFERENT workspace does not apply", () => {
        const global = row({ id: "global", workspaceId: null });
        const overrideOther = row({ id: "override", workspaceId: "ws-2" });
        const found = findPricingRow({
            candidates: [global, overrideOther],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("global");
    });

    test("overlapping ranges in same scope → most-recent effectiveFrom wins", () => {
        // Two overlapping rows. ts = 2024-03-01 is inside both. Pick the one with
        // the later effectiveFrom (2024-02-01).
        const a = row({
            id: "a",
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: new Date("2024-12-31T00:00:00Z"),
        });
        const b = row({
            id: "b",
            effectiveFrom: new Date("2024-02-01T00:00:00Z"),
            effectiveTo: new Date("2024-12-31T00:00:00Z"),
        });
        const found = findPricingRow({
            candidates: [a, b],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2024-03-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("b");
    });

    test("filters by provider/model/region exactly", () => {
        const wrongProvider = row({ id: "w1", provider: "anthropic" });
        const wrongModel = row({ id: "w2", model: "claude-3-5" });
        const wrongRegion = row({ id: "w3", region: "us-east-1" });
        const correct = row({ id: "ok" });
        const found = findPricingRow({
            candidates: [wrongProvider, wrongModel, wrongRegion, correct],
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            ts: new Date("2025-01-01T00:00:00Z"),
            workspaceId: "ws-1",
        });
        expect(found?.id).toBe("ok");
    });
});
