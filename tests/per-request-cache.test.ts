/**
 * withRequestMemo wraps an async loader so two identical callsites within a
 * single React render share a result. Outside an RSC render (tests, scripts),
 * React's cache() degrades to identity - each call runs the wrapped fn.
 *
 * These tests verify the contract that matters for callers:
 *   - the wrapper forwards args and returns the same value as the inner fn
 *   - distinct args produce distinct results
 *
 * The per-render dedup contract (identical args collapse to one inner call)
 * is covered in per-request-cache-dedup.test.ts via an injected cache.
 */

import { withRequestMemo } from "@/lib/dashboard/per-request-cache";
import { describe, expect, test } from "bun:test";

describe("withRequestMemo", () => {
    test("forwards args to the wrapped fn and returns its result", async () => {
        let captured: unknown;
        const wrapped = withRequestMemo(async (workspaceId: string, n: number) => {
            captured = { workspaceId, n };
            return `${workspaceId}:${n}`;
        });

        const out = await wrapped("ws-1", 7);

        expect(out).toBe("ws-1:7");
        expect(captured).toEqual({ workspaceId: "ws-1", n: 7 });
    });

    test("distinct arg shapes produce distinct results", async () => {
        const wrapped = withRequestMemo(async (input: { workspaceId: string }) => {
            return input.workspaceId.toUpperCase();
        });

        expect(await wrapped({ workspaceId: "ws-a" })).toBe("WS-A");
        expect(await wrapped({ workspaceId: "ws-b" })).toBe("WS-B");
    });
});
