/**
 * `readEventBundleStatus` suppresses the fair-use banner for an admin-owned
 * workspace: the live count still reports, but the banner ladder is forced to
 * "none" so the operator's own tenants never see the cap warning. Non-admin
 * workspaces banner as usual.
 */

import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import {
    readEventBundleStatus,
    setEventBundleDepsForTesting,
    type EventBundleDeps,
} from "@/lib/event-bundle/server";
import type { EventBundleUsageRepository } from "@/lib/event-bundle/types";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const MONTH = "2025-06";

const fakeUsage: EventBundleUsageRepository = {
    async findMonth() {
        return null;
    },
    async upsertMonth() {},
};

async function stage(eventsCount: number, isAdminOwned: boolean): Promise<void> {
    const counter = new InMemoryEventBundleCounterStore();
    await counter.seedMonth({ workspaceId: WORKSPACE, month: MONTH, value: eventsCount });
    const deps: EventBundleDeps = {
        enabled: true,
        counter,
        usage: fakeUsage,
        now: () => NOW,
        isAdminOwned: async () => isAdminOwned,
    };
    setEventBundleDepsForTesting(deps);
}

describe("readEventBundleStatus admin-owned suppression", () => {
    afterEach(() => setEventBundleDepsForTesting(null));

    test("admin-owned over the cap → bannerLevel none, count still reported", async () => {
        await stage(BUNDLE_EVENTS_PER_MONTH + 100, true);
        const status = await readEventBundleStatus(WORKSPACE);
        expect(status.bannerLevel).toBe("none");
        expect(status.eventsCount).toBe(BUNDLE_EVENTS_PER_MONTH + 100);
    });

    test("non-admin over the cap → bannerLevel exhausted", async () => {
        await stage(BUNDLE_EVENTS_PER_MONTH + 100, false);
        const status = await readEventBundleStatus(WORKSPACE);
        expect(status.bannerLevel).toBe("exhausted");
    });
});
