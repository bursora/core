/**
 * Self-host counterpart to `bell-feed-locked-filter.test.ts`.
 *
 * On self-host (`IS_CLOUD=false`) there are no subscriptions — every
 * `subscription_status` is NULL. The bell feed must therefore apply NO
 * subscription filter, or it would hide every notification. This pins that the
 * cloud-only gate never leaks into the self-host path.
 */

import type {
    NotificationsRepository,
} from "@/lib/notifications/notifications.repository";
import {
    listNotificationsPage,
    setNotificationsRepoForTesting,
} from "@/lib/notifications/server";
import { afterEach, expect, test } from "bun:test";
import { installSelfHostEnv } from "../support/with-self-host-env";

installSelfHostEnv();

type ListForUserInput = Parameters<NotificationsRepository["listForUser"]>[0];

afterEach(() => setNotificationsRepoForTesting(null));

test("self-host bell feed applies no subscription filter", async () => {
    let captured: ListForUserInput | undefined;
    setNotificationsRepoForTesting({
        insertIgnore: async () => {},
        markRead: async () => {},
        markAllRead: async () => {},
        listForUser: async (input) => {
            captured = input;
            return [];
        },
    });

    await listNotificationsPage({ userId: "11111111-2222-3333-4444-555555555555" });

    expect(captured?.subscriptionStatuses).toBeUndefined();
});
