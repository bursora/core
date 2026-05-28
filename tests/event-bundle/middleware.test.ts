/**
 * Behavioral tests for the event-bundle middleware halves:
 *   - disabled (self-host) → both halves no-op
 *   - no hard cap → pre-write check allows
 *   - hard cap not yet reached → pre-write check allows
 *   - hard cap would be exceeded → pre-write check returns deny + bundle reason
 *   - record bumps the hot counter AND the cold rollup with absolute values
 *   - record skips on zero events
 */

import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import {
    checkEventBundleHardCap,
    recordEventBundleUsage,
    resetEventBundleColdWriteTracker,
} from "@/lib/event-bundle/middleware";
import { setEventBundleDepsForTesting, type EventBundleDeps } from "@/lib/event-bundle/server";
import type {
    EventBundleMonthRollup,
    EventBundleSettings,
    EventBundleUsageRepository,
} from "@/lib/event-bundle/types";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const MONTH = "2025-06";

const fakeSettings = (row: EventBundleSettings | null) => ({
    async findByWorkspaceId() {
        return row;
    },
    async upsert() {},
});

const fakeUsage = (
    initial?: EventBundleMonthRollup,
): EventBundleUsageRepository & {
    readonly writes: { eventsCount: number; overageCents: number }[];
} => {
    const writes: { eventsCount: number; overageCents: number }[] = [];
    let row: EventBundleMonthRollup | null = initial ?? null;
    return {
        writes,
        async findMonth() {
            return row;
        },
        async upsertMonth(input) {
            row = { eventsCount: input.eventsCount, overageCents: input.overageCents };
            writes.push({ eventsCount: input.eventsCount, overageCents: input.overageCents });
        },
    };
};

const baseDeps = (overrides: Partial<EventBundleDeps> = {}): EventBundleDeps => ({
    enabled: true,
    counter: new InMemoryEventBundleCounterStore(),
    settings: fakeSettings(null),
    usage: fakeUsage(),
    now: () => NOW,
    ...overrides,
});

describe("checkEventBundleHardCap", () => {
    afterEach(() => setEventBundleDepsForTesting(null));

    test("disabled (self-host) → allow regardless of cap", async () => {
        setEventBundleDepsForTesting(
            baseDeps({
                enabled: false,
                settings: fakeSettings({ hardCapUsdCents: 1 }),
            }),
        );
        const decision = await checkEventBundleHardCap({
            workspaceId: WORKSPACE,
            eventCount: 1_000_000,
        });
        expect(decision.allowed).toBe(true);
    });

    test("no hard cap row → allow", async () => {
        setEventBundleDepsForTesting(baseDeps());
        const decision = await checkEventBundleHardCap({
            workspaceId: WORKSPACE,
            eventCount: 10_000_000,
        });
        expect(decision.allowed).toBe(true);
    });

    test("null hard cap on existing row → allow", async () => {
        setEventBundleDepsForTesting(
            baseDeps({ settings: fakeSettings({ hardCapUsdCents: null }) }),
        );
        const decision = await checkEventBundleHardCap({
            workspaceId: WORKSPACE,
            eventCount: 10_000_000,
        });
        expect(decision.allowed).toBe(true);
    });

    test("under cap → allow", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        // Seed at bundle exactly → next 1000 events = 30 cents, under $5 cap.
        await counter.seedMonth({
            workspaceId: WORKSPACE,
            month: MONTH,
            value: BUNDLE_EVENTS_PER_MONTH,
        });
        setEventBundleDepsForTesting(
            baseDeps({
                counter,
                settings: fakeSettings({ hardCapUsdCents: 500 }),
            }),
        );

        const decision = await checkEventBundleHardCap({
            workspaceId: WORKSPACE,
            eventCount: 1_000,
        });
        expect(decision.allowed).toBe(true);
    });

    test("would exceed cap → deny with bundle reason", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        // Already at bundle + 5000 → already 150 cents accrued, well past $1 cap.
        await counter.seedMonth({
            workspaceId: WORKSPACE,
            month: MONTH,
            value: BUNDLE_EVENTS_PER_MONTH + 5_000,
        });
        setEventBundleDepsForTesting(
            baseDeps({
                counter,
                settings: fakeSettings({ hardCapUsdCents: 100 }),
            }),
        );

        const decision = await checkEventBundleHardCap({
            workspaceId: WORKSPACE,
            eventCount: 1,
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe("bundle");
    });
});

describe("recordEventBundleUsage", () => {
    afterEach(() => {
        setEventBundleDepsForTesting(null);
        resetEventBundleColdWriteTracker();
    });

    test("disabled → no writes", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        const usage = fakeUsage();
        setEventBundleDepsForTesting(baseDeps({ enabled: false, counter, usage }));

        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 100 });

        expect(await counter.readMonth({ workspaceId: WORKSPACE, month: MONTH })).toBe(0);
        expect(usage.writes).toHaveLength(0);
    });

    test("zero events → skip", async () => {
        const usage = fakeUsage();
        setEventBundleDepsForTesting(baseDeps({ usage }));
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 0 });
        expect(usage.writes).toHaveLength(0);
    });

    test("bumps counter and writes rollup with absolute totals", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        const usage = fakeUsage();
        setEventBundleDepsForTesting(baseDeps({ counter, usage }));

        await recordEventBundleUsage({
            workspaceId: WORKSPACE,
            eventCount: BUNDLE_EVENTS_PER_MONTH + 2_000,
        });

        const hot = await counter.readMonth({ workspaceId: WORKSPACE, month: MONTH });
        expect(hot).toBe(BUNDLE_EVENTS_PER_MONTH + 2_000);

        // 2000 overage events = 60 cents.
        expect(usage.writes).toHaveLength(1);
        expect(usage.writes[0]).toEqual({
            eventsCount: BUNDLE_EVENTS_PER_MONTH + 2_000,
            overageCents: 60,
        });
    });

    test("batches cold writes: small increments between flushes don't hit the rollup", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        const usage = fakeUsage();
        setEventBundleDepsForTesting(baseDeps({ counter, usage }));

        // First write always flushes (no prior tracker entry).
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 10 });
        // Small follow-up within the interval and below the batch threshold:
        // counter still bumps, cold write skipped.
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 10 });
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 10 });

        expect(await counter.readMonth({ workspaceId: WORKSPACE, month: MONTH })).toBe(30);
        expect(usage.writes).toHaveLength(1);
        expect(usage.writes[0]?.eventsCount).toBe(10);
    });

    test("batches cold writes: crossing the per-batch event threshold flushes again", async () => {
        const counter = new InMemoryEventBundleCounterStore();
        const usage = fakeUsage();
        setEventBundleDepsForTesting(baseDeps({ counter, usage }));

        // First write flushes at 10.
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 10 });
        // 1000 more crosses the COLD_WRITE_BATCH_EVENTS threshold → flush.
        await recordEventBundleUsage({ workspaceId: WORKSPACE, eventCount: 1_000 });

        expect(usage.writes).toHaveLength(2);
        expect(usage.writes[1]?.eventsCount).toBe(1_010);
    });
});
