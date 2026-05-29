/**
 * Renders the EventBundleBanner against staged in-memory event-bundle deps
 * and asserts the visible copy matches the fair-use banner ladder.
 *
 *   - self-host (`enabled: false`)   → renders nothing
 *   - bannerLevel "none" (low usage) → renders nothing
 *   - "approaching" (80%+)           → warning, "Approaching"
 *   - "exhausted" (100%+)            → warning, "Fair-use cap reached"
 *
 * The cap is alert-only: even when exhausted the banner warns rather than
 * announcing a block, and never shows an overage dollar amount.
 */

import { EventBundleBanner } from "@/app/(dashboard)/workspace/[workspaceId]/_components/event-bundle-banner";
import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import { setEventBundleDepsForTesting, type EventBundleDeps } from "@/lib/event-bundle/server";
import type { EventBundleUsageRepository } from "@/lib/event-bundle/types";
import { afterEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const MONTH = "2025-06";

const fakeUsage: EventBundleUsageRepository = {
    async findMonth() {
        return null;
    },
    async upsertMonth() {},
};

async function seedAndStage(eventsCount: number): Promise<void> {
    const counter = new InMemoryEventBundleCounterStore();
    await counter.seedMonth({ workspaceId: WORKSPACE, month: MONTH, value: eventsCount });
    const deps: EventBundleDeps = {
        enabled: true,
        counter,
        usage: fakeUsage,
        now: () => NOW,
    };
    setEventBundleDepsForTesting(deps);
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

    test("exhausted threshold renders warning variant with fair-use copy", async () => {
        await seedAndStage(BUNDLE_EVENTS_PER_MONTH + 100);
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).toContain("text-warning");
        expect(html).toContain("Fair-use cap reached");
    });

    test("exhausted banner never announces a block or a dollar overage", async () => {
        await seedAndStage(BUNDLE_EVENTS_PER_MONTH * 3);
        const html = await renderBanner();
        expect(html).not.toBeNull();
        expect(html).not.toContain("$");
        expect(html?.toLowerCase()).not.toContain("reject");
    });
});
