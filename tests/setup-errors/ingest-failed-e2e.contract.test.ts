/**
 * End-to-end contract for the `ingest_failed` chain: an ingest data-layer
 * failure records a setup-error → fans out a banner notification to workspace
 * members → the dashboard reads the live count and renders the banner copy.
 *
 * The route's "ingest throws → setupErrorLogger().log({ kind: 'ingest_failed' })"
 * link is covered by tests/metering/events-route.test.ts. This test picks up at
 * that recorded failure and proves the rest of the chain through REAL repos
 * against real Postgres (PGlite + production migrations): the member fan-out
 * resolves a real workspace member, the banner row lands in the real
 * notifications table with the right copy/dedup key, repeats dedup, and
 * summarize + the banner substitution produce the expected text.
 *
 * The hourly bucket repo is the in-memory fake: the production Drizzle repo
 * detects insert-vs-update via `RETURNING (xmax = 0)`, a system-column trick
 * PGlite doesn't support. The fake mirrors its created-flag + sum semantics, so
 * the fan-out gating and summarize count are still exercised faithfully.
 */

import { schema } from "@/lib/db";
import { formatCount } from "@/lib/format";
import { COUNT_PLACEHOLDER } from "@/lib/notices/labels";
import { drizzleNotificationsRepository } from "@/lib/notifications/notifications.repository";
import { DASHBOARD_WINDOW_MS } from "@/lib/setup-errors/category";
import {
    parseSetupErrorDedupKey,
    recordSetupError,
    setSetupErrorsDepsForTesting,
    summarizeSetupErrorsSince,
} from "@/lib/setup-errors/server";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb, truncateAll, type TestDbHandle } from "../support/pglite-db";

const WS = "11111111-2222-3333-4444-555555555555";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
// Fixed clock so the hour bucket + dedup key are deterministic.
const NOW = new Date("2025-05-10T12:34:56.000Z");
const BUCKET_HOUR_ISO = "2025-05-10T12:00:00.000Z";

let handle: TestDbHandle;
let buckets: InMemorySetupErrorRepository;

beforeAll(async () => {
    handle = await createTestDb();
});

afterAll(async () => {
    await handle.close();
});

afterEach(() => setSetupErrorsDepsForTesting(null));

beforeEach(async () => {
    await truncateAll(handle.pg);
    await handle.db.insert(schema.users).values({
        id: USER,
        name: "Owner",
        email: "owner@example.com",
    });
    await handle.db.insert(schema.workspaces).values({ id: WS, name: "Acme" });
    await handle.db
        .insert(schema.workspaceMembers)
        .values({ workspaceId: WS, userId: USER, role: "owner" });

    buckets = new InMemorySetupErrorRepository();
    setSetupErrorsDepsForTesting({
        repo: buckets,
        now: () => NOW,
        // Real DB: the fan-out write + member resolution + dashboard read.
        // Members are read with a direct query rather than DrizzleMemberRepository
        // because a sibling test mock.module-stubs that class process-wide.
        notifications: drizzleNotificationsRepository(handle.db),
        listMemberUserIds: async (ws) =>
            (
                await handle.db
                    .select({ userId: schema.workspaceMembers.userId })
                    .from(schema.workspaceMembers)
                    .where(eq(schema.workspaceMembers.workspaceId, ws))
            ).map((r) => r.userId),
    });
});

const bannerRows = () =>
    handle.db.select().from(schema.notifications).where(eq(schema.notifications.workspaceId, WS));

describe("ingest_failed end-to-end (real Postgres)", () => {
    test("records the bucket and fans out a banner notification to the member", async () => {
        // What app/api/v1/events/route.ts does when ingestEvents throws.
        await recordSetupError({ kind: "ingest_failed", workspaceId: WS });

        expect(buckets.rows).toHaveLength(1);
        expect(buckets.rows[0]?.category).toBe("ingest_failed");
        expect(buckets.rows[0]?.count).toBe(1);

        const notifs = await bannerRows();
        expect(notifs).toHaveLength(1);
        expect(notifs[0]?.userId).toBe(USER);
        expect(notifs[0]?.source).toBe("setup_error");
        expect(notifs[0]?.display).toBe("banner");
        expect(notifs[0]?.severity).toBe("critical");
        expect(notifs[0]?.title).toBe("Some usage events didn't record");
        expect(notifs[0]?.dedupKey).toBe(`setup_error:ingest_failed:${BUCKET_HOUR_ISO}`);
        expect(notifs[0]?.body).toContain(COUNT_PLACEHOLDER);
    });

    test("repeats in the same hour increment the count but never duplicate the banner, and the dashboard renders the live count", async () => {
        await recordSetupError({ kind: "ingest_failed", workspaceId: WS });
        await recordSetupError({ kind: "ingest_failed", workspaceId: WS });

        expect(buckets.rows[0]?.count).toBe(2);

        // Banner is written once at the 0→1 crossing; the second failure dedups.
        const notifs = await bannerRows();
        expect(notifs).toHaveLength(1);

        // Dashboard read path: summarize returns the live 24h count.
        const summary = await summarizeSetupErrorsSince(WS, DASHBOARD_WINDOW_MS);
        expect(summary.get("ingest_failed")?.count).toBe(2);

        // Dashboard render: the same substitution the banner does (resolveBody),
        // applied to the real stored body + the live count.
        const category = parseSetupErrorDedupKey(notifs[0]!.dedupKey);
        expect(category).toBe("ingest_failed");
        const count = summary.get(category!)!.count;
        const rendered = notifs[0]!.body.replaceAll(COUNT_PLACEHOLDER, formatCount(count));
        expect(rendered).toBe(
            "Usage events Bursora failed to record in the last 24h: 2. Recent spend may be undercounted; the SDK retries automatically.",
        );
    });
});
