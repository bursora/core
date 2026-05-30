/**
 * View-paywall, cross-workspace bell leak guard (cloud).
 *
 * The notification bell (`listNotificationsPage`) aggregates notifications
 * across every workspace the user belongs to — it is NOT scoped to the current
 * workspace, so the layout/page paywall gate does not cover it. A locked cloud
 * workspace must not leak its alert content (spend spikes, budget blocks)
 * through the bell, so on cloud the feed is filtered to workspaces with an
 * active subscription. (Self-host has no subscriptions; covered in
 * `bell-feed-selfhost.test.ts`.)
 *
 * Behavioural: seeds an active workspace plus a never-subscribed (NULL) and a
 * canceled one, then asserts only the active workspace's rows survive the cloud
 * feed — the exact leak a regression would re-open.
 */

import type {
    NotificationRow,
    NotificationsRepository,
} from "@/lib/notifications/notifications.repository";
import {
    listNotificationsPage,
    setNotificationsRepoForTesting,
} from "@/lib/notifications/server";
import { afterEach, expect, test } from "bun:test";
import { installCloudEnv } from "../support/with-cloud-env";

installCloudEnv();

const USER = "11111111-2222-3333-4444-555555555555";

function makeRow(id: string, workspaceId: string): NotificationRow {
    return {
        id,
        workspaceId,
        workspaceName: workspaceId,
        userId: USER,
        source: "alert",
        dedupKey: id,
        severity: "critical",
        title: "Spend spiked",
        body: "Spend spiked to $420 for tenant acme",
        href: null,
        display: "inline",
        createdAt: new Date(0),
        readAt: null,
    };
}

/**
 * Faithful stand-in for the Drizzle repo's `inArray(subscription_status, …)`:
 * a row survives only when its workspace status is in the requested set. A NULL
 * status (never subscribed) is excluded, matching `NULL IN (…)` → NULL → drop.
 */
function repoWithStatuses(
    seed: ReadonlyArray<{ row: NotificationRow; status: string | null }>,
): NotificationsRepository {
    return {
        insertIgnore: async () => {},
        markRead: async () => {},
        markAllRead: async () => {},
        listForUser: async (input) => {
            if (input.subscriptionStatuses === undefined) return seed.map((s) => s.row);
            const allowed = new Set(input.subscriptionStatuses);
            return seed
                .filter((s) => s.status !== null && allowed.has(s.status))
                .map((s) => s.row);
        },
    };
}

afterEach(() => setNotificationsRepoForTesting(null));

test("cloud bell feed drops never-subscribed and canceled workspace rows", async () => {
    const active = "aaaaaaaa-0000-0000-0000-000000000001";
    const neverSubscribed = "bbbbbbbb-0000-0000-0000-000000000002";
    const canceled = "cccccccc-0000-0000-0000-000000000003";
    setNotificationsRepoForTesting(
        repoWithStatuses([
            { row: makeRow("00000000-0000-0000-0000-0000000000a1", active), status: "active" },
            {
                row: makeRow("00000000-0000-0000-0000-0000000000b2", neverSubscribed),
                status: null,
            },
            {
                row: makeRow("00000000-0000-0000-0000-0000000000c3", canceled),
                status: "canceled",
            },
        ]),
    );

    const page = await listNotificationsPage({ userId: USER });
    const ids = page.items.map((i) => i.id);

    expect(ids).toEqual(["00000000-0000-0000-0000-0000000000a1"]);
});
