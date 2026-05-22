import { isActiveLink, resolveActiveWorkspaceId } from "@/components/shell/app-shell-helpers";
import { describe, expect, test } from "bun:test";

const workspaces = [
    { id: "ws-a", name: "Acme" },
    { id: "ws-b", name: "Beta" },
];

describe("resolveActiveWorkspaceId", () => {
    test("URL wins when valid", () => {
        const id = resolveActiveWorkspaceId({
            fromUrl: "ws-b",
            fromCookie: "ws-a",
            available: workspaces,
        });
        expect(id).toBe("ws-b");
    });

    test("falls back to cookie when URL is missing", () => {
        const id = resolveActiveWorkspaceId({
            fromUrl: undefined,
            fromCookie: "ws-a",
            available: workspaces,
        });
        expect(id).toBe("ws-a");
    });

    test("ignores stale URL/cookie not in memberships", () => {
        const id = resolveActiveWorkspaceId({
            fromUrl: "ws-zzz",
            fromCookie: "ws-yyy",
            available: workspaces,
        });
        expect(id).toBe("ws-a");
    });

    test("returns null when user has no workspaces", () => {
        const id = resolveActiveWorkspaceId({
            fromUrl: undefined,
            fromCookie: undefined,
            available: [],
        });
        expect(id).toBeNull();
    });
});

describe("isActiveLink", () => {
    test("workspace home requires exact match", () => {
        expect(isActiveLink("/workspace/ws-a", "/workspace/ws-a")).toBe(true);
        expect(isActiveLink("/workspace/ws-a/spend", "/workspace/ws-a")).toBe(false);
    });

    test("other routes match by prefix", () => {
        expect(isActiveLink("/workspace/ws-a/spend", "/workspace/ws-a/spend")).toBe(true);
        expect(isActiveLink("/workspace/ws-a/spend/tx-1", "/workspace/ws-a/spend")).toBe(true);
        expect(isActiveLink("/workspace/ws-a/spending", "/workspace/ws-a/spend")).toBe(false);
    });
});
