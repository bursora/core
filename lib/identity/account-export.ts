/**
 * Account data export (GDPR Art. 20 portability).
 *
 * Assembles a machine-readable bundle of everything tied to one user: their
 * profile, billing state, and — for each workspace they belong to — the
 * workspace's config and a usage summary. Strictly self-scoped: only
 * workspaces with a membership row for this user are included, so no other
 * tenant's data is reachable.
 *
 * Secrets never enter the bundle. API keys are exported as metadata only
 * (name, suffix, scopes, lifecycle dates) — never the hash or the encrypted
 * seal. Alert channels are reduced to their kinds, so Slack/Discord webhook
 * URLs and recipient addresses stay out.
 */

import "server-only";

import { db, schema } from "@/lib/db";
import {
    countEventsForWorkspace,
    getLastUsageEventAt,
    getSpendSeries,
} from "@/lib/metering/server";
import type { AlertChannelKind } from "@/lib/notification/alert-channel";
import { desc, eq } from "drizzle-orm";

export interface AccountExport {
    readonly exportedAt: string;
    readonly user: {
        readonly id: string;
        readonly email: string;
        readonly name: string;
        readonly emailVerified: boolean;
        readonly role: string;
        readonly status: string;
        readonly createdAt: string;
        readonly updatedAt: string;
    };
    readonly subscription: {
        readonly status: string | null;
        readonly subscribedAt: string | null;
        readonly refundEligibleUntil: string | null;
    } | null;
    readonly workspaces: readonly WorkspaceExport[];
}

export interface WorkspaceExport {
    readonly id: string;
    readonly name: string;
    readonly environment: string;
    readonly role: string;
    readonly joinedAt: string;
    readonly createdAt: string;
    readonly apiKeys: readonly {
        readonly id: string;
        readonly name: string;
        readonly last6: string | null;
        readonly scopes: readonly string[];
        readonly createdAt: string;
        readonly revokedAt: string | null;
        readonly suspendedAt: string | null;
    }[];
    readonly budgets: readonly {
        readonly id: string;
        readonly scopeType: string;
        readonly scopeId: string | null;
        readonly period: string;
        readonly amountUsd: string;
        readonly mode: string;
    }[];
    readonly alertRules: readonly {
        readonly id: string;
        readonly kind: string;
        readonly params: unknown;
        readonly channels: readonly AlertChannelKind[];
    }[];
    readonly usage: {
        readonly totalEvents: number;
        readonly lastEventAt: string | null;
        readonly last30Days: { readonly spendUsd: string; readonly events: number };
    };
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reduce a rule's stored channels to the set of channel kinds (no secrets). */
function channelKinds(raw: unknown): AlertChannelKind[] {
    if (!Array.isArray(raw)) return [];
    const kinds: AlertChannelKind[] = [];
    for (const entry of raw) {
        if (typeof entry !== "object" || entry === null) continue;
        const kind = (entry as { kind?: unknown }).kind;
        if ((kind === "slack" || kind === "discord" || kind === "email") && !kinds.includes(kind)) {
            kinds.push(kind);
        }
    }
    return kinds;
}

async function exportWorkspace(
    row: {
        workspaceId: string;
        name: string;
        environment: string;
        role: string;
        joinedAt: Date;
        createdAt: Date;
    },
    now: Date,
): Promise<WorkspaceExport> {
    const workspaceId = row.workspaceId;
    const database = db();

    const [apiKeys, budgets, alertRules, totalEvents, lastEventAt, spend] = await Promise.all([
        // Explicit columns: never select keyHash / cipher* so a secret can't
        // leak even if the schema grows new sensitive columns.
        database
            .select({
                id: schema.apiKeys.id,
                name: schema.apiKeys.name,
                last6: schema.apiKeys.last6,
                scopes: schema.apiKeys.scopes,
                createdAt: schema.apiKeys.createdAt,
                revokedAt: schema.apiKeys.revokedAt,
                suspendedAt: schema.apiKeys.suspendedAt,
            })
            .from(schema.apiKeys)
            .where(eq(schema.apiKeys.workspaceId, workspaceId))
            .orderBy(desc(schema.apiKeys.createdAt)),
        database
            .select({
                id: schema.budgets.id,
                scopeType: schema.budgets.scopeType,
                scopeId: schema.budgets.scopeId,
                period: schema.budgets.period,
                amountUsd: schema.budgets.amountUsd,
                mode: schema.budgets.mode,
            })
            .from(schema.budgets)
            .where(eq(schema.budgets.workspaceId, workspaceId))
            .orderBy(desc(schema.budgets.createdAt)),
        database
            .select({
                id: schema.alertRules.id,
                kind: schema.alertRules.kind,
                params: schema.alertRules.params,
                channels: schema.alertRules.channels,
            })
            .from(schema.alertRules)
            .where(eq(schema.alertRules.workspaceId, workspaceId)),
        countEventsForWorkspace({ workspaceId, status: "both" }),
        getLastUsageEventAt({ workspaceId }),
        getSpendSeries({
            workspaceId,
            facet: "model",
            from: new Date(now.getTime() - 30 * DAY_MS),
            to: now,
            status: "both",
        }),
    ]);

    return {
        id: workspaceId,
        name: row.name,
        environment: row.environment,
        role: row.role,
        joinedAt: row.joinedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        apiKeys: apiKeys.map((k) => ({
            id: k.id,
            name: k.name,
            last6: k.last6,
            scopes: k.scopes,
            createdAt: k.createdAt.toISOString(),
            revokedAt: iso(k.revokedAt),
            suspendedAt: iso(k.suspendedAt),
        })),
        budgets: budgets.map((b) => ({
            id: b.id,
            scopeType: b.scopeType,
            scopeId: b.scopeId,
            period: b.period,
            amountUsd: b.amountUsd,
            mode: b.mode,
        })),
        alertRules: alertRules.map((r) => ({
            id: r.id,
            kind: r.kind,
            params: r.params,
            channels: channelKinds(r.channels),
        })),
        usage: {
            totalEvents,
            lastEventAt: iso(lastEventAt),
            last30Days: { spendUsd: spend.totalUsd, events: spend.totalCalls },
        },
    };
}

/**
 * Builds the self-scoped export bundle for `userId`. Returns null when no user
 * row exists (e.g. a stale session after a purge).
 */
export async function exportAccountData(userId: string): Promise<AccountExport | null> {
    const now = new Date();
    const database = db();

    const [userRow] = await database
        .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            emailVerified: schema.users.emailVerified,
            role: schema.users.role,
            status: schema.users.status,
            createdAt: schema.users.createdAt,
            updatedAt: schema.users.updatedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
    if (!userRow) return null;

    const [subRow] = await database
        .select({
            status: schema.userSubscriptions.subscriptionStatus,
            subscribedAt: schema.userSubscriptions.subscribedAt,
            refundEligibleUntil: schema.userSubscriptions.refundEligibleUntil,
        })
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, userId))
        .limit(1);

    const memberships = await database
        .select({
            workspaceId: schema.workspaces.id,
            name: schema.workspaces.name,
            environment: schema.workspaces.environment,
            role: schema.workspaceMembers.role,
            joinedAt: schema.workspaceMembers.createdAt,
            createdAt: schema.workspaces.createdAt,
        })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, userId))
        .orderBy(desc(schema.workspaces.createdAt));

    const workspaces = await Promise.all(memberships.map((m) => exportWorkspace(m, now)));

    return {
        exportedAt: now.toISOString(),
        user: {
            id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            emailVerified: userRow.emailVerified,
            role: userRow.role,
            status: userRow.status,
            createdAt: userRow.createdAt.toISOString(),
            updatedAt: userRow.updatedAt.toISOString(),
        },
        subscription: subRow
            ? {
                  status: subRow.status,
                  subscribedAt: iso(subRow.subscribedAt),
                  refundEligibleUntil: iso(subRow.refundEligibleUntil),
              }
            : null,
        workspaces,
    };
}
