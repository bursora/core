import { InMemorySpikeStateStore } from "@/lib/spike-protection/in-memory.adapter";
import { describe, expect, test } from "bun:test";

describe("InMemorySpikeStateStore", () => {
    test("increments by n inside one bucket", async () => {
        const store = new InMemorySpikeStateStore();
        const a = await store.incrementMinute({
            workspaceId: "w1",
            bucketMs: 60_000,
            n: 3,
        });
        expect(a.priorCount).toBe(0);
        expect(a.newCount).toBe(3);
        const b = await store.incrementMinute({
            workspaceId: "w1",
            bucketMs: 60_000,
            n: 2,
        });
        expect(b.priorCount).toBe(3);
        expect(b.newCount).toBe(5);
    });

    test("separates buckets by minute and by workspace", async () => {
        const store = new InMemorySpikeStateStore();
        await store.incrementMinute({ workspaceId: "w1", bucketMs: 0, n: 5 });
        await store.incrementMinute({ workspaceId: "w1", bucketMs: 60_000, n: 1 });
        const newMinute = await store.incrementMinute({
            workspaceId: "w1",
            bucketMs: 60_000,
            n: 0,
        });
        expect(newMinute.newCount).toBe(1);

        const otherWorkspace = await store.incrementMinute({
            workspaceId: "w2",
            bucketMs: 0,
            n: 0,
        });
        expect(otherWorkspace.newCount).toBe(0);
    });

    test("cooldown getter returns 0 when nothing set", async () => {
        const store = new InMemorySpikeStateStore();
        const state = await store.getCooldown({ workspaceId: "w1" });
        expect(state.untilMs).toBe(0);
    });

    test("cooldown setter is read back exactly", async () => {
        const store = new InMemorySpikeStateStore();
        await store.setCooldown({ workspaceId: "w1", untilMs: 999_999 });
        const state = await store.getCooldown({ workspaceId: "w1" });
        expect(state.untilMs).toBe(999_999);
    });
});
