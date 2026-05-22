import {
    buildWorkspacePath,
    buildWorkspaceSwitchUrl,
    extractWorkspaceIdFromPath,
} from "@/lib/routes";
import { describe, expect, test } from "bun:test";

describe("buildWorkspacePath", () => {
    test("workspace home when no section", () => {
        expect(String(buildWorkspacePath("ws-a"))).toBe("/workspace/ws-a");
    });

    test("section appended after workspace id", () => {
        expect(String(buildWorkspacePath("ws-a", "spend"))).toBe("/workspace/ws-a/spend");
    });

    test("workspace id is URL-encoded", () => {
        expect(String(buildWorkspacePath("ws a/b", "keys"))).toBe("/workspace/ws%20a%2Fb/keys");
    });

    test("appends query string when given", () => {
        expect(
            String(
                buildWorkspacePath("ws-a", "spend", {
                    facet: "tenant",
                    from: "2025-05-09T12:00:00.000Z",
                    to: "2025-05-10T12:00:00.000Z",
                }),
            ),
        ).toBe(
            "/workspace/ws-a/spend?facet=tenant&from=2025-05-09T12%3A00%3A00.000Z&to=2025-05-10T12%3A00%3A00.000Z",
        );
    });

    test("URL-encodes query values", () => {
        expect(String(buildWorkspacePath("ws-a", "alerts", { scope_id: "acme corp" }))).toBe(
            "/workspace/ws-a/alerts?scope_id=acme+corp",
        );
    });

    test("omits trailing ? when query is empty", () => {
        expect(String(buildWorkspacePath("ws-a", "spend", {}))).toBe("/workspace/ws-a/spend");
    });

    test("supports query without a section", () => {
        expect(String(buildWorkspacePath("ws-a", undefined, { tab: "billing" }))).toBe(
            "/workspace/ws-a?tab=billing",
        );
    });
});

describe("extractWorkspaceIdFromPath", () => {
    test("returns workspace id from workspace path", () => {
        expect(extractWorkspaceIdFromPath("/workspace/ws-a/spend")).toBe("ws-a");
    });

    test("returns workspace id at workspace home", () => {
        expect(extractWorkspaceIdFromPath("/workspace/ws-a")).toBe("ws-a");
    });

    test("returns null for non-workspace paths", () => {
        expect(extractWorkspaceIdFromPath("/login")).toBeNull();
        expect(extractWorkspaceIdFromPath("/")).toBeNull();
    });
});

describe("buildWorkspaceSwitchUrl", () => {
    test("maps workspace segment to new id, preserving section", () => {
        expect(buildWorkspaceSwitchUrl("/workspace/ws-a/spend", "ws-b")).toBe(
            "/workspace/ws-b/spend",
        );
    });

    test("works at workspace home", () => {
        expect(buildWorkspaceSwitchUrl("/workspace/ws-a", "ws-b")).toBe("/workspace/ws-b");
    });

    test("falls back to workspace home for non-workspace paths", () => {
        expect(buildWorkspaceSwitchUrl("/", "ws-b")).toBe("/workspace/ws-b");
    });

    test("workspace id is URL-encoded (consistent with builders)", () => {
        expect(buildWorkspaceSwitchUrl("/workspace/ws-a/spend", "ws b/c")).toBe(
            "/workspace/ws%20b%2Fc/spend",
        );
    });
});
