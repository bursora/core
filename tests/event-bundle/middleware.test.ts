/**
 * Behavioral tests for the event-bundle recording path:
 *   - disabled (self-host) → no writes
 *   - record bumps the hot counter AND the cold rollup with absolute totals
 *   - record skips on zero events
 *   - cold writes batch (interval + per-batch event threshold)
 *
 * Ingest never blocks on the bundle: the fair-use cap is alert-only, so the
 * middleware has no reject path to test.
 */

import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import {
    recordEventBundleUsage,
    resetEventBundleColdWriteTracker,
} from "@/lib/event-bundle/middleware";
import { setEventBundleDepsForTesting, type EventBundleDeps } from "@/lib/event-bundle/server";
import type { EventBundleMonthRollup, EventBundleUsageRepository } from "@/lib/event-bundle/types";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const MONTH = "2025-06";

const fakeUsage = (
    initial?: EventBundleMonthRollup,
): EventBundleUsageRepository & {
    readonly writes: { eventsCount: number }[];
} => {
    const writes: { eventsCount: number }[] = [];
    let row: EventBundleMonthRollup | null = initial ?? null;
    return {
        writes,
        async findMonth() {
            return row;
        },
        async upsertMonth(input) {
            row = { eventsCount: input.eventsCount };
            writes.push({ eventsCount: input.eventsCount });
        },
    };
};

const baseDeps = (overrides: Partial<EventBundleDeps> = {}): EventBundleDeps => ({
    enabled: true,
    counter: new InMemoryEventBundleCounterStore(),
    usage: fakeUsage(),
    now: () => NOW,
    ...overrides,
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

        expect(usage.writes).toHaveLength(1);
        expect(usage.writes[0]).toEqual({ eventsCount: BUNDLE_EVENTS_PER_MONTH + 2_000 });
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
