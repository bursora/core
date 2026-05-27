/**
 * `WorkspaceBannerNotifications` reads notifications tagged display='banner'
 * for the current user+workspace and renders one row per `DismissibleBanner`.
 * Source-agnostic — works for alert + setup_error + any future writer that
 * sets display='banner'.
 */

import { WorkspaceBannerNotifications } from "@/app/(dashboard)/workspace/[workspaceId]/_components/workspace-banner-notifications";
import { setNotificationsRepoForTesting } from "@/lib/notifications/server";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function renderBanner(repo: InMemoryNotificationsRepository): Promise<string | null> {
    setNotificationsRepoForTesting(repo);
    const element = await WorkspaceBannerNotifications({ workspaceId: WORKSPACE, userId: USER });
    if (element === null) return null;
    return renderToStaticMarkup(element as ReactElement);
}

describe("WorkspaceBannerNotifications", () => {
    afterEach(() => {
        setNotificationsRepoForTesting(null);
        setSetupErrorsDepsForTesting(null);
    });

    test("returns null when there are no banner-tagged notifications", async () => {
        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        await repo.insertIgnore([
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "inline-only",
                severity: "warning",
                title: "Inline",
                body: "should not banner",
                href: null,
            },
        ]);

        const html = await renderBanner(repo);

        expect(html).toBeNull();
    });

    test("renders one row per banner notification", async () => {
        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        await repo.insertIgnore([
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "alert:1",
                severity: "critical",
                title: "Budget exceeded",
                body: "workspace burned $10.00 of $10.00",
                href: "/workspace/abc/budgets#budget-1",
                display: "banner",
            },
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "alert:2",
                severity: "warning",
                title: "Anomaly detected",
                body: "spike on agent-7",
                href: "/workspace/abc/alerts",
                display: "banner",
            },
        ]);

        const html = await renderBanner(repo);

        expect(html).toContain("Budget exceeded");
        expect(html).toContain("Anomaly detected");
    });

    test("skips read banner notifications", async () => {
        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        await repo.insertIgnore([
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "alert:1",
                severity: "critical",
                title: "Already dismissed",
                body: "x",
                href: null,
                display: "banner",
            },
        ]);
        await repo.markAllRead({ userId: USER, now: new Date() });

        const html = await renderBanner(repo);

        expect(html).toBeNull();
    });

    test("scopes to the requested workspace + user", async () => {
        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        repo.setWorkspaceName("99999999-9999-9999-9999-999999999999", "Other");
        await repo.insertIgnore([
            {
                workspaceId: "99999999-9999-9999-9999-999999999999",
                userId: USER,
                source: "alert",
                dedupKey: "other-workspace",
                severity: "critical",
                title: "Different workspace",
                body: "should not appear",
                href: null,
                display: "banner",
            },
        ]);

        const html = await renderBanner(repo);

        expect(html).toBeNull();
    });

    test("substitutes {count} in setup_error body with live 24h bucket sum", async () => {
        const setupRepo = new InMemorySetupErrorRepository();
        // 120 errors across two hourly buckets, both inside the 24h window.
        for (let i = 0; i < 100; i++) {
            await setupRepo.incrementBucket({
                workspaceId: WORKSPACE,
                category: "auth_revoked",
                bucketHour: new Date("2026-05-19T09:00:00.000Z"),
            });
        }
        for (let i = 0; i < 20; i++) {
            await setupRepo.incrementBucket({
                workspaceId: WORKSPACE,
                category: "auth_revoked",
                bucketHour: new Date("2026-05-19T10:00:00.000Z"),
            });
        }
        setSetupErrorsDepsForTesting({
            repo: setupRepo,
            now: () => new Date("2026-05-19T11:00:00.000Z"),
            notifications: new InMemoryNotificationsRepository(),
            listMemberUserIds: async () => [],
        });

        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        await repo.insertIgnore([
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "setup_error",
                dedupKey: "setup_error:auth_revoked:2026-05-19T09:00:00.000Z",
                severity: "critical",
                title: "Unrecognized API key",
                body: "Requests rejected as unauthorized in the last 24h: {count}. Check your API key.",
                href: `/workspace/${WORKSPACE}`,
                display: "banner",
            },
        ]);

        const html = await renderBanner(repo);

        expect(html).not.toBeNull();
        expect(html).toContain("120");
        expect(html).not.toContain("{count}");
    });

    test("destructive variant for critical, warning variant otherwise", async () => {
        const repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE, "Acme");
        await repo.insertIgnore([
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "alert:1",
                severity: "critical",
                title: "Critical",
                body: "x",
                href: null,
                display: "banner",
            },
            {
                workspaceId: WORKSPACE,
                userId: USER,
                source: "alert",
                dedupKey: "alert:2",
                severity: "warning",
                title: "Warning",
                body: "y",
                href: null,
                display: "banner",
            },
        ]);

        const html = await renderBanner(repo);

        expect(html).not.toBeNull();
        expect(html).toContain("text-destructive");
        expect(html).toContain("text-warning");
    });
});
