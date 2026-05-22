import { buildSpendLink, flattenScope, scopeLabel } from "@/lib/detection";
import { formatRelativeTime } from "@/lib/format";
import { describe, expect, test } from "bun:test";

describe("flattenScope", () => {
    test("agent wins over tenant", () => {
        expect(
            flattenScope({
                scope: { workspaceId: "w", tenantId: "t-1", agentId: "a-1" },
            }),
        ).toEqual({ type: "agent", id: "a-1" });
    });

    test("tenant when no agent", () => {
        expect(
            flattenScope({
                scope: { workspaceId: "w", tenantId: "t-1", agentId: null },
            }),
        ).toEqual({ type: "tenant", id: "t-1" });
    });

    test("workspace when neither", () => {
        expect(
            flattenScope({
                scope: { workspaceId: "w", tenantId: null, agentId: null },
            }),
        ).toEqual({ type: "workspace", id: null });
    });
});

describe("scopeLabel", () => {
    test("type:id when id present", () => {
        expect(scopeLabel({ type: "tenant", id: "acme" })).toBe("tenant:acme");
    });

    test("type only when id missing", () => {
        expect(scopeLabel({ type: "workspace", id: null })).toBe("workspace");
    });
});

describe("buildSpendLink", () => {
    const now = new Date("2025-05-10T12:00:00Z");
    const iso = (d: Date) => d.toISOString();

    test("workspace scope maps to facet=tenant with 24h window", () => {
        const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const href = buildSpendLink("ws-1", { type: "workspace", id: null }, from, now);
        expect(String(href)).toBe(
            `/workspace/ws-1/spend?facet=tenant&from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(now))}`,
        );
    });

    test("agent scope passes scope_id with 7d window", () => {
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const href = buildSpendLink("ws-1", { type: "agent", id: "a-7" }, from, now);
        expect(String(href)).toBe(
            `/workspace/ws-1/spend?facet=agent&from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(now))}&scope_id=a-7`,
        );
    });

    test("tenant scope passes scope_id with 30d window", () => {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const href = buildSpendLink("ws-1", { type: "tenant", id: "acme" }, from, now);
        expect(String(href)).toBe(
            `/workspace/ws-1/spend?facet=tenant&from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(now))}&scope_id=acme`,
        );
    });
});

describe("formatRelativeTime", () => {
    const now = new Date("2025-01-15T12:00:00Z").getTime();

    test("seconds ago", () => {
        expect(formatRelativeTime(new Date(now - 30_000), now)).toBe("30 seconds ago");
    });

    test("minutes ago", () => {
        expect(formatRelativeTime(new Date(now - 5 * 60_000), now)).toBe("5 minutes ago");
    });

    test("hours ago", () => {
        expect(formatRelativeTime(new Date(now - 2 * 3600_000), now)).toBe("2 hours ago");
    });

    test("days ago", () => {
        expect(formatRelativeTime(new Date(now - 3 * 86400_000), now)).toBe("3 days ago");
    });

    test("just now for under 5s", () => {
        expect(formatRelativeTime(new Date(now - 1_000), now)).toBe("just now");
    });
});
