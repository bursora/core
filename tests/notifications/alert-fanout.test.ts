/**
 * Tests for the alert→notification fan-out handler.
 *
 * Subscribed to `alert.raised`. For every workspace member, inserts one
 * notification row keyed by `alert:{alertId}` (user scope comes from the
 * unique index, not the key) so retries dedup.
 */

import type { AnomalyAlertRaisedEvent, BudgetAlertRaisedEvent } from "@/lib/event-bus";
import { fanOutAlertNotification } from "@/lib/notifications/fan-out-alert";
import { localizeNotificationBody } from "@/lib/notifications/window-token";
import { describe, expect, test } from "bun:test";
import { InMemoryNotificationsRepository } from "./fakes/in-memory-notifications.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ALERT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const anomalyEvent: AnomalyAlertRaisedEvent = {
    kind: "anomaly",
    alertId: ALERT_ID,
    workspaceId: WORKSPACE,
    tenantId: "tenant-a",
    agentId: "support-bot",
    reason: "Spend spiked 5.0x baseline.",
    deviation: 200,
    severity: "critical",
    raisedAt: new Date("2026-05-13T12:00:00Z"),
    windowStart: new Date("2026-05-13T12:00:00Z"),
    windowEnd: new Date("2026-05-13T12:05:00Z"),
    windowCostUsd: 1.23,
};

const budgetEvent: BudgetAlertRaisedEvent = {
    kind: "budget",
    alertId: ALERT_ID,
    workspaceId: WORKSPACE,
    budgetId: "b-99",
    scopeType: "tenant",
    scopeId: "acme",
    period: "monthly",
    periodFrom: new Date("2026-05-01T00:00:00Z"),
    mode: "block",
    used: 75,
    limit: 50,
    pctOver: 50,
    severity: "warning",
    raisedAt: new Date("2026-05-13T12:00:00Z"),
};

describe("fanOutAlertNotification", () => {
    test("inserts one notification row per workspace member with the correct dedup key", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: async () => [USER_A, USER_B],
        });

        expect(notifications.rows).toHaveLength(2);
        const dedupKeys = notifications.rows.map((r) => r.dedupKey);
        // dedup key is per-alert; userId is already in the unique index columns.
        expect(dedupKeys).toEqual([`alert:${ALERT_ID}`, `alert:${ALERT_ID}`]);
    });

    test("anomaly fan-out shape: title, reason + tz-neutral window token, severity, href", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: async () => [USER_A],
        });

        const [row] = notifications.rows;
        expect(row).toBeDefined();
        expect(row?.source).toBe("alert");
        expect(row?.title).toBe("Anomaly detected");
        expect(row?.body).toContain("Spend spiked 5.0x baseline.");
        // The window is persisted as a tz-neutral token (no baked clock time),
        // so the in-app read path can render it in the viewer's zone.
        const utc = localizeNotificationBody(row?.body ?? "", "UTC");
        expect(utc).toContain("$1.23");
        expect(utc).toContain("12:00-12:05 UTC");
        const local = localizeNotificationBody(row?.body ?? "", "Europe/Tirane");
        expect(local).toContain("14:00-14:05");
        expect(row?.severity).toBe("critical");
        expect(row?.href).toBe(`/workspace/${WORKSPACE}/alerts`);
    });

    test("budget fan-out shape: title, body, severity, href deep-links to the budget row", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: budgetEvent,
            notifications,
            listMemberUserIds: async () => [USER_A],
        });

        const [row] = notifications.rows;
        expect(row).toBeDefined();
        expect(row?.source).toBe("alert");
        expect(row?.title).toBe("Budget exceeded");
        // Attribution body: scope + spend/cap + offender + outcome.
        expect(row?.body).toContain("tenant:acme");
        expect(row?.body).toContain("$75.00");
        expect(row?.body).toContain("$50.00");
        expect(row?.body).toContain("calls blocked");
        // No em dashes in user-facing copy.
        expect(row?.body).not.toContain("—");
        expect(row?.severity).toBe("warning");
        expect(row?.href).toBe(`/workspace/${WORKSPACE}/budgets#budget-${budgetEvent.budgetId}`);
    });

    test("throttle mode body says 'calls throttled' instead of 'calls blocked'", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: { ...budgetEvent, mode: "throttle" },
            notifications,
            listMemberUserIds: async () => [USER_A],
        });
        const [row] = notifications.rows;
        expect(row?.body).toContain("calls throttled");
    });

    test("notify mode body has no 'blocked/throttled' suffix", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: { ...budgetEvent, mode: "notify" },
            notifications,
            listMemberUserIds: async () => [USER_A],
        });
        const [row] = notifications.rows;
        expect(row?.body).not.toContain("blocked");
        expect(row?.body).not.toContain("throttled");
    });

    test("retry with same event is idempotent — second fan-out inserts nothing new", async () => {
        const notifications = new InMemoryNotificationsRepository();
        const members = async () => [USER_A, USER_B];

        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: members,
        });
        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: members,
        });

        expect(notifications.rows).toHaveLength(2);
    });

    test("workspace with no members → no rows", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: async () => [],
        });
        expect(notifications.rows).toHaveLength(0);
    });

    test("budget body includes denied-since-trip enrichment when reader returns count", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: budgetEvent,
            notifications,
            listMemberUserIds: async () => [USER_A],
            deniedSinceTrip: 9,
        });
        const [row] = notifications.rows;
        expect(row?.body).toContain("9 calls denied since trip");
    });

    test("anomaly body does not include denied-since-trip", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: anomalyEvent,
            notifications,
            listMemberUserIds: async () => [USER_A],
            deniedSinceTrip: 9,
        });
        const [row] = notifications.rows;
        expect(row?.body).not.toContain("denied");
    });

    test("reader omitted → no denial line appended", async () => {
        const notifications = new InMemoryNotificationsRepository();
        await fanOutAlertNotification({
            event: budgetEvent,
            notifications,
            listMemberUserIds: async () => [USER_A],
        });
        const [row] = notifications.rows;
        expect(row?.body).not.toContain("denied");
    });
});
