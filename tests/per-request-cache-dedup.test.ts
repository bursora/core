import type { RequestMemoCache } from "@/app/(dashboard)/workspace/[workspaceId]/_lib/per-request-cache";
import { withRequestMemo } from "@/app/(dashboard)/workspace/[workspaceId]/_lib/per-request-cache";
import { describe, expect, test } from "bun:test";

function makeStringCache(): RequestMemoCache {
    const store = new Map<string, unknown>();
    return <R>(fn: (key: string) => Promise<R>) => {
        return (key: string): Promise<R> => {
            if (store.has(key)) return store.get(key) as Promise<R>;
            const result = fn(key);
            store.set(key, result);
            return result;
        };
    };
}

describe("withRequestMemo - per-render dedup", () => {
    test("two fresh object literals with the same shape invoke the inner fn once", async () => {
        let calls = 0;
        const wrapped = withRequestMemo(async (input: { workspaceId: string; n: number }) => {
            calls += 1;
            return input.n * 2;
        }, makeStringCache());

        const a = await wrapped({ workspaceId: "ws", n: 3 });
        const b = await wrapped({ workspaceId: "ws", n: 3 });

        expect(a).toBe(6);
        expect(b).toBe(6);
        expect(calls).toBe(1);
    });

    test("two `{ workspaceId, now }` literals collapse on identical Date instants", async () => {
        let calls = 0;
        const wrapped = withRequestMemo(async (input: { workspaceId: string; now: Date }) => {
            calls += 1;
            return input.now.getTime();
        }, makeStringCache());

        const ts = new Date("2026-05-17T12:00:00.000Z");
        const r1 = await wrapped({ workspaceId: "ws", now: new Date(ts) });
        const r2 = await wrapped({ workspaceId: "ws", now: new Date(ts) });

        expect(calls).toBe(1);
        expect(r1).toBe(ts.getTime());
        expect(r2).toBe(ts.getTime());
    });

    test("distinct arg shapes invoke the inner fn twice", async () => {
        let calls = 0;
        const wrapped = withRequestMemo(async (input: { workspaceId: string }) => {
            calls += 1;
            return input.workspaceId;
        }, makeStringCache());

        await wrapped({ workspaceId: "ws-a" });
        await wrapped({ workspaceId: "ws-b" });

        expect(calls).toBe(2);
    });
});
