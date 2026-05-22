/**
 * Renders the EventBundleBanner against staged in-memory event-bundle deps
 * and asserts the visible copy matches the banner-threshold ladder.
 *
 *   - self-host (`enabled: false`)              → renders nothing
 *   - bundleLevel "none" (low usage)            → renders nothing
 *   - "approaching" (80%+)                      → warning, "Approaching"
 *   - "exhausted" (100%+)                       → warning, "Bundle exhausted"
 *   - "heavy" (150%+ or hard cap hit)           → destructive, heavy copy
 */

import { EventBundleBanner } from "@/app/(dashboard)/workspace/[workspaceId]/_components/event-bundle-banner";
import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import { setEventBundleDepsForTesting, type EventBundleDeps } from "@/lib/event-bundle/server";
import type {
    EventBundleSettings,
    EventBundleSettingsRepository,
    EventBundleUsageRepository,
} from "@/lib/event-bundle/types";
import { afterEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const MONTH = "2025-06";

const fakeSettings = (row: EventBundleSettings | null): EventBundleSettingsRepository => ({
    async findByWorkspaceId() {
        return row;
    },
    async upsert() {},
});

const fakeUsage: EventBundleUsageRepository = {
    async findMonth() {
        return null;
    },
    async upsertMonth() {},
};

async function seedAndStage(
    eventsCount: number,
    overrides: Partial<EventBundleDeps> = {},
): Promise<EventBundleDeps> {
    const counter = new InMemoryEventBundleCounterStore();
    await counter.seedMonth({ workspaceId: WORKSPACE, month: MONTH, value: eventsCount });
    const deps: EventBundleDeps = {
        enabled: true,
        counter,
        settings: fakeSettings(null),
        usage: fakeUsage,
        now: () => NOW,
        ...overrides,
    };
    setEventBundleDepsForTesting(deps);
    return deps;
}

async function renderBanner(): Promise<string | null> {
    const element = await EventBundleBanner({ workspaceId: WORKSPACE });
    if (element === null) return null;
    return renderToStaticMarkup(element as ReactElement);
}

describe("EventBundleBanner", () => {
    afterEach(() => setEventBundleDepsForTesting(null));

    test("self-host (enabled: false) → renders nothing", async () => {
        setEventBundleDepsForTesting({
            enabled: false,
            counter: new InMemoryEventBundleCounterStore(),
            settings: fakeSettings(null),
            usage: fakeUsage,
            now: () => NOW,
        });
        expect(await renderBanner()).toBeNull();
    });

    test("low usage → renders nothing", async () => {
        await seedAndStage(BUNDLE_EVENTS_PER_MONTH * 0.1);
        expect(await renderBanner()).toBeNull();
    });

    test("approaching threshold renders warning variant", async () => {
        await seedAndStage(Math.floor(BUNDLE_EVENTS_PER_MONTH * 0.85));
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).toContain("text-warning");
        expect(html).toContain("Approaching");
    });

    test("exhausted threshold renders warning variant with exhausted copy", async () => {
        await seedAndStage(BUNDLE_EVENTS_PER_MONTH + 100);
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).toContain("text-warning");
        expect(html).toContain("Bundle exhausted");
    });

    test("heavy threshold (150%+) renders destructive variant", async () => {
        await seedAndStage(Math.ceil(BUNDLE_EVENTS_PER_MONTH * 1.5));
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).toContain("text-destructive");
        expect(html).toContain("Heavy overage");
    });

    test("hard cap hit renders destructive variant with hard-cap copy", async () => {
        // Already past cap: 5K overage events = 150 cents, cap = 100 cents.
        await seedAndStage(BUNDLE_EVENTS_PER_MONTH + 5_000, {
            settings: fakeSettings({ hardCapUsdCents: 100 }),
        });
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).toContain("text-destructive");
        expect(html).toContain("Hard cap reached");
    });
});
