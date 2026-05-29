/**
 * Event-bundle wiring.
 *
 * Cloud-only by design: on self-host (`IS_CLOUD=false`) the dispatcher
 * returns `enabled: false` and every callsite no-ops. No Redis writes,
 * no Postgres writes, no banner.
 *
 * Routes and dashboards call the bound helpers below. Tests inject fakes
 * via `setEventBundleDepsForTesting`.
 */

import "server-only";

import { db } from "@/lib/db";
import { env } from "../env";
import { redisClient } from "../redis/client";
import {
    BUNDLE_EVENTS_PER_MONTH,
    bannerLevel,
    monthKey,
    type EventBundleBannerLevel,
} from "./counter";
import { drizzleEventBundleUsageRepository } from "./drizzle-usage.repository";
import { InMemoryEventBundleCounterStore } from "./in-memory.adapter";
import { RedisEventBundleCounterStore } from "./redis.adapter";
import type { EventBundleCounterStore, EventBundleUsageRepository } from "./types";

export interface EventBundleDeps {
    readonly enabled: boolean;
    readonly counter: EventBundleCounterStore;
    readonly usage: EventBundleUsageRepository;
    readonly now: () => Date;
}

let testOverride: EventBundleDeps | null = null;

export function setEventBundleDepsForTesting(deps: EventBundleDeps | null): void {
    testOverride = deps;
}

export function eventBundleDeps(): EventBundleDeps {
    if (testOverride !== null) return testOverride;
    const e = env();
    const enabled = e.IS_CLOUD;
    const counter: EventBundleCounterStore = enabled
        ? new RedisEventBundleCounterStore(redisClient(e.REDIS_URL))
        : new InMemoryEventBundleCounterStore();
    return {
        enabled,
        counter,
        usage: drizzleEventBundleUsageRepository(db()),
        now: () => new Date(),
    };
}

export interface EventBundleStatus {
    readonly enabled: boolean;
    readonly eventsCount: number;
    readonly bundleEvents: number;
    readonly bannerLevel: EventBundleBannerLevel;
    readonly month: string;
}

/**
 * Dashboard read: returns the live counter for the current calendar month
 * against the fixed fair-use bundle so the banner and settings UI can render
 * a complete view.
 *
 * Returns `enabled: false` on self-host so the caller can hide the banner
 * and the settings section without a separate `IS_CLOUD` check.
 */
export async function readEventBundleStatus(workspaceId: string): Promise<EventBundleStatus> {
    const deps = eventBundleDeps();
    const month = monthKey(deps.now());
    if (!deps.enabled) {
        return {
            enabled: false,
            eventsCount: 0,
            bundleEvents: BUNDLE_EVENTS_PER_MONTH,
            bannerLevel: "none",
            month,
        };
    }

    const [hot, cold] = await Promise.all([
        deps.counter.readMonth({ workspaceId, month }),
        deps.usage.findMonth({ workspaceId, month }),
    ]);

    // Reconcile from the cold store if Redis is below the persisted rollup
    // (Redis loss, fresh deploy). The middleware writes both on every
    // increment so the cold store is the conservative source of truth.
    const eventsCount = Math.max(hot, cold?.eventsCount ?? 0);
    if (cold !== null && hot < cold.eventsCount) {
        await deps.counter.seedMonth({ workspaceId, month, value: cold.eventsCount });
    }

    return {
        enabled: true,
        eventsCount,
        bundleEvents: BUNDLE_EVENTS_PER_MONTH,
        bannerLevel: bannerLevel(eventsCount),
        month,
    };
}
