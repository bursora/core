/**
 * Bursora V1 schema — Drizzle declarations.
 *
 * The `usage_events` table is partitioned by month at the SQL level (see
 * migration 0000). Drizzle has no first-class partition support yet, so we
 * declare the parent table here for typed queries and let the migration handle
 * the `PARTITION BY RANGE` and partition-creation DDL.
 */

import { sql } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

// --- better-auth tables (owned by better-auth) -------------------------------
// `users` is renamed from better-auth's default `user` via `user.modelName` in
// lib/auth.ts so app FKs (workspace_members, workspace_invites) reference the
// same row better-auth manages — single source of truth, no mirror sync.

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Global platform role (admin | user). Distinct from the per-workspace
    // workspace_members.role (owner | member). Owned by better-auth via an
    // `additionalFields` entry in lib/auth.ts; `input: false` there blocks
    // client writes so signup/profile/API input can never set it.
    role: text("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// --- user_subscriptions -------------------------------------------------------
// Billing state, scoped to the subscribing user (the account that pays), not
// the workspace. One row per user; absence of a row means the user has never
// opened Checkout. All fields are nullable so a freshly-inserted row before
// activation, and every self-host install, leaves them empty.
//
// `subscription_status` mirrors the upstream provider's subscription state
// verbatim (e.g. `active`, `past_due`, `cancelled`, `expired`).
// `subscribed_at` is set the first time Checkout completes.
// `refund_eligible_until` is signup + 30 days — used by the UI to surface the
// money-back window. `provider_customer_id` is uniquely indexed so a provider
// webhook can reverse-resolve the user from its customer id.
export const userSubscriptions = pgTable(
    "user_subscriptions",
    {
        userId: uuid("user_id")
            .primaryKey()
            .references(() => users.id, { onDelete: "cascade" }),
        providerCustomerId: text("provider_customer_id"),
        providerSubscriptionId: text("provider_subscription_id"),
        subscriptionStatus: text("subscription_status"),
        subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
        refundEligibleUntil: timestamp("refund_eligible_until", { withTimezone: true }),
    },
    (t) => [uniqueIndex("user_subscriptions_provider_customer_idx").on(t.providerCustomerId)],
);

// --- workspaces ---------------------------------------------------------------
export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    environment: text("environment").notNull().default("prod"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- workspace_members --------------------------------------------------------
export const workspaceMembers = pgTable(
    "workspace_members",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: text("role").notNull().default("member"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// --- workspace_invites --------------------------------------------------------
export const workspaceInvites = pgTable(
    "workspace_invites",
    {
        token: text("token").primaryKey(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        invitedBy: uuid("invited_by")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: text("role").notNull().default("member"),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        acceptedAt: timestamp("accepted_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("workspace_invites_workspace_idx").on(t.workspaceId),
        index("workspace_invites_email_idx").on(t.email),
    ],
);

// --- api_keys -----------------------------------------------------------------
export const apiKeys = pgTable(
    "api_keys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        keyHash: text("key_hash").notNull(),
        // AES-256-GCM seal of the plaintext (base64). Lets workspace members
        // reveal/copy the key on demand. NULL on rows issued before encryption
        // at rest existed — those degrade to "rotate to enable copy".
        cipherText: text("cipher_text"),
        cipherIv: text("cipher_iv"),
        cipherAuthTag: text("cipher_auth_tag"),
        // Non-secret display hint: trailing 6 chars of the plaintext, persisted
        // at issue time so the masked list can show a Stripe-style suffix
        // without decrypting the seal. NULL on legacy rows → all-dots mask.
        last6: text("last6"),
        name: text("name").notNull().default(""),
        scopes: text("scopes")
            .array()
            .notNull()
            .default([] as string[] as never),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
    },
    (t) => [
        uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
        index("api_keys_workspace_idx").on(t.workspaceId),
    ],
);

// --- api_key_audit_log -------------------------------------------------------
// Append-only audit trail for `api_keys` lifecycle (create / revoke / rename /
// reveal).
// Each successful mutation against `api_keys` writes a row here so the workspace
// can answer "who did what, from where, when?" without reconstructing it from
// application logs.
//
// `user_id` is ON DELETE SET NULL so historical entries survive a user removal
// (the action still happened — we just don't know who anymore). `metadata` is
// jsonb so per-action shape can grow without a schema migration.
export const apiKeyAuditLog = pgTable(
    "api_key_audit_log",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        apiKeyId: uuid("api_key_id").notNull(),
        userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
        action: text("action").notNull(), // 'create' | 'revoke' | 'rename' | 'reveal'
        metadata: jsonb("metadata"),
        ip: text("ip"),
        ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("api_key_audit_log_workspace_ts_idx").on(t.workspaceId, t.ts.desc())],
);

// --- budgets ------------------------------------------------------------------
export const budgets = pgTable(
    "budgets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        scopeType: text("scope_type").notNull(), // workspace | tenant | agent | workflow
        scopeId: text("scope_id"), // null for workspace-wide
        period: text("period").notNull(), // daily | weekly | monthly
        amountUsd: numeric("amount_usd", { precision: 12, scale: 4 }).notNull(),
        mode: text("mode").notNull(), // notify | throttle | block
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("budgets_scope_idx").on(t.workspaceId, t.scopeType, t.scopeId)],
);

// --- pricing ------------------------------------------------------------------
// `workspaceId` is nullable: NULL rows are global rates scraped by the daily
// cron; non-NULL rows are workspace-scoped overrides set in settings. The
// pricing-sync cron only touches NULL rows.
export const pricing = pgTable(
    "pricing",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id").references(() => workspaces.id, {
            onDelete: "cascade",
        }),
        provider: text("provider").notNull(),
        model: text("model").notNull(),
        region: text("region").notNull().default("global"),
        inputPer1mUsd: numeric("input_per_1m_usd", { precision: 12, scale: 6 }).notNull(),
        outputPer1mUsd: numeric("output_per_1m_usd", { precision: 12, scale: 6 }).notNull(),
        cachePer1mUsd: numeric("cache_per_1m_usd", { precision: 12, scale: 6 }),
        effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
        effectiveTo: timestamp("effective_to", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("pricing_lookup_idx").on(t.provider, t.model, t.region, t.effectiveFrom),
        index("pricing_workspace_idx").on(t.workspaceId),
    ],
);

// --- alert_rules --------------------------------------------------------------
export const alertRules = pgTable("alert_rules", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // anomaly | budget | spike
    params: jsonb("params").notNull().default({}),
    channels: jsonb("channels").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- alerts -------------------------------------------------------------------
// Append-only feed of raised alerts. Anomaly rows are produced by the
// detection cron; budget rows are produced by the budgeting decision path
// once per `(workspace_id, budget_id, period_from)` crossing.
//
// `period_from` is only set for budget rows and powers the dedupe partial
// unique index that prevents duplicate notification fires within a budget
// window.
export const alerts = pgTable(
    "alerts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(), // anomaly | budget
        scopeType: text("scope_type").notNull(), // workspace | tenant | agent | budget
        scopeId: text("scope_id"), // null for workspace-wide; budget id for budget rows
        reason: text("reason").notNull(),
        deviation: numeric("deviation", { precision: 14, scale: 6 }).notNull(),
        severity: text("severity").notNull(), // warning | critical
        periodFrom: timestamp("period_from", { withTimezone: true }), // budget rows only
        // Aggregate spend ($) inside the 5-min anomaly bucket. NULL for budget rows.
        // `raised_at` IS the window start (and window end = raised_at + 5 min), so
        // only the cost needs denormalizing.
        windowCostUsd: numeric("window_cost_usd", { precision: 14, scale: 8 }),
        raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("alerts_workspace_raised_idx").on(t.workspaceId, t.raisedAt),
        // Partial unique: budget rows dedupe per (workspace, scope, window).
        // Mirrors migrations 0012 + 0034 so drizzle-kit diff stays a no-op.
        // The live index is declared `NULLS NOT DISTINCT` so workspace-level
        // crossings (scope_id IS NULL) collide on conflict; drizzle's
        // uniqueIndex builder has no API for that clause on a partial index,
        // so the SQL is authored by hand in migration 0034. Do not regenerate.
        uniqueIndex("alerts_budget_crossing_uniq")
            .on(t.workspaceId, t.scopeId, t.periodFrom)
            .where(sql`${t.kind} = 'budget'`),
    ],
);

// --- usage_events (partitioned parent) ---------------------------------------
// NOTE: Drizzle has no native PARTITION BY support; the migration creates the
// parent with `PARTITION BY RANGE (ts)` and the per-month partitions. This
// declaration mirrors the column shape for typed queries only.
//
// `decided_by_budget_id` is set on `status='blocked'` rows to the budget that
// tripped the denial; NULL for `status='ok'` rows (real usage) and for any
// blocked row written before this column existed. ON DELETE SET NULL keeps
// blocked rows queryable after the originating budget is removed.
//
// `provider` / `model` carry the SDK's intended call target on `'blocked'`
// rows (real values on `'ok'` rows). `block_reason` is the protocol reason
// string from `evaluateBudget`. NULL on `'ok'` rows.
export const usageEvents = pgTable(
    "usage_events",
    {
        id: uuid("id").notNull().defaultRandom(),
        workspaceId: uuid("workspace_id").notNull(),
        tenantId: text("tenant_id"),
        agentId: text("agent_id"),
        workflowId: text("workflow_id"),
        provider: text("provider"),
        model: text("model"),
        promptTokens: integer("prompt_tokens").notNull().default(0),
        completionTokens: integer("completion_tokens").notNull().default(0),
        cacheTokens: integer("cache_tokens").notNull().default(0),
        latencyMs: integer("latency_ms"),
        costUsd: numeric("cost_usd", { precision: 14, scale: 8 }).notNull(),
        requestId: text("request_id"),
        // Lifecycle of the event row.
        //   'ok'      → real call accepted by the budget, billed at recorded cost.
        //   'blocked' → call denied by `evaluateBudget`; `block_reason` and
        //               `decided_by_budget_id` are populated, cost is 0.
        // Future states (e.g. 'refunded', 'invoiced') would extend this enum
        // as billing flows that need to mutate or annotate past rows land.
        status: text("status").notNull().default("ok"),
        decidedByBudgetId: uuid("decided_by_budget_id").references(() => budgets.id, {
            onDelete: "set null",
        }),
        // Protocol reason string from `evaluateBudget`
        // (e.g. `workspace:*:over:1.8/2`). Set only on `'blocked'` rows.
        blockReason: text("block_reason"),
        ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    },
    // Composite primary key: Postgres partition tables require the partition
    // key in the PK. Workspace+status+ts index covers dashboard aggregates that
    // the lookup btree (workspace, tenant, agent, ts) can't serve without pinned
    // tenant_id / agent_id.
    //
    // Partial unique index `(workspace_id, request_id, ts) WHERE request_id IS
    // NOT NULL` makes ingest idempotent per `requestId`: retried SDK deliveries
    // land on the same row instead of double-billing the customer. `ts` is the
    // trailing key because a partitioned table's unique index must include the
    // partition key, so dedup is per-time-partition (a retry with a different
    // `ts` won't collapse; the SDK replays the original `ts`). Rows without a
    // requestId skip the index (NULL request_id is rejected by the WHERE
    // clause), so the SDK's optional-requestId contract is preserved. Authored
    // by hand in migration 0037; drizzle's uniqueIndex builder mirrors columns
    // only.
    (t) => [
        primaryKey({ columns: [t.id, t.ts] }),
        index("usage_events_workspace_status_ts_idx").on(t.workspaceId, t.status, t.ts),
        uniqueIndex("usage_events_workspace_request_uidx")
            .on(t.workspaceId, t.requestId, t.ts)
            .where(sql`${t.requestId} IS NOT NULL`),
    ],
);

// --- setup_errors ------------------------------------------------------------
// Hourly counters of SDK setup failures, surfaced on the workspace dashboard
// banner. Two distinct signals:
//   - ingest_invalid_body / sdk_unknown_provider → per-workspace
//                                                  (workspace_id set, post-auth)
//   - auth_unknown                               → global bucket (workspace_id
//                                                  NULL), admin-only
//                                                  observability. All auth
//                                                  failures land here because
//                                                  the offered key may carry
//                                                  a forged workspace fragment.
//   - auth_revoked                               → legacy category retained
//                                                  for already-stored buckets
//                                                  and for the dashboard label;
//                                                  no longer produced.
// Upserted via the composite unique index `(workspace_id, category,
// bucket_hour)`. The index is declared NULLS NOT DISTINCT so the global bucket
// can also be deduplicated. See migration 0015.
export const setupErrors = pgTable(
    "setup_errors",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id").references(() => workspaces.id, {
            onDelete: "cascade",
        }),
        category: text("category").notNull(),
        bucketHour: timestamp("bucket_hour", { withTimezone: true }).notNull(),
        count: integer("count").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    // Upsert key declared with `NULLS NOT DISTINCT` in the migration so the
    // global (workspace_id NULL) bucket deduplicates; drizzle-orm 0.45.2 has no
    // builder for that modifier, so this declaration covers columns only.
    (t) => [
        index("setup_errors_workspace_bucket_idx").on(t.workspaceId, t.bucketHour),
        uniqueIndex("setup_errors_bucket_uniq").on(t.workspaceId, t.category, t.bucketHour),
    ],
);

// --- notifications -----------------------------------------------------------
// Per-(user, workspace) inbox of notification rows. Each row is a discrete
// event for one user; the producer fans out one row per workspace member when
// a new event fires (e.g. a new hourly setup-error bucket is created).
//
// `source` identifies the producer (`setup_error`, `alert`, ...). `dedup_key`
// is the producer-stable identifier that keeps fan-outs idempotent — the
// unique index `(workspace_id, user_id, dedup_key)` rejects duplicates from
// retries. `read_at` is null until the recipient dismisses the row.
//
// The dashboard banner reads unread rows; marking a row read clears it from
// the banner but leaves the history intact for any future inbox UI.
export const notifications = pgTable(
    "notifications",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        source: text("source").notNull(),
        dedupKey: text("dedup_key").notNull(),
        severity: text("severity").notNull(),
        title: text("title").notNull(),
        body: text("body").notNull(),
        href: text("href"),
        // 'inline' (default): bell list only. 'banner': bell list + workspace-
        // wide banner strip in the dashboard shell. Writers set this at insert
        // time; reads filter on it for the banner pipeline.
        display: text("display").notNull().default("inline"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        readAt: timestamp("read_at", { withTimezone: true }),
    },
    (t) => [
        uniqueIndex("notifications_dedup_uniq").on(t.workspaceId, t.userId, t.dedupKey),
        index("notifications_list_idx").on(t.userId, t.readAt, t.createdAt),
    ],
);

// --- notification_deliveries -------------------------------------------------
// Per-attempt log of alert channel deliveries (Slack / Discord webhooks +
// email). Powers the dashboard "channel health" dots: latest row per kind
// drives the dot color and tooltip. `target` is the SHA-256 of the channel
// destination (webhook URL or email address — never the raw value);
// `error.message` is truncated to 500 chars at write time.
//
// The composite (workspace_id, channel_kind, attempted_at desc) index makes
// the latest-per-kind lookup an index seek.
export const notificationChannelKind = pgEnum("notification_channel_kind", [
    "slack",
    "discord",
    "email",
]);

export const notificationDeliveryStatus = pgEnum("notification_delivery_status", ["ok", "failed"]);

export const notificationDeliveries = pgTable(
    "notification_deliveries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        channelKind: notificationChannelKind("channel_kind").notNull(),
        target: text("target").notNull(),
        status: notificationDeliveryStatus("status").notNull(),
        error: text("error"),
        attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
        latencyMs: integer("latency_ms"),
    },
    (t) => [
        index("notification_deliveries_lookup_idx").on(t.workspaceId, t.channelKind, t.attemptedAt),
    ],
);

// --- billing_webhook_events --------------------------------------------------
// Idempotency log for billing-provider webhook deliveries. The handler inserts
// the upstream event id (`evt_...`) before applying side effects; the primary
// key + ON CONFLICT DO NOTHING turns retried deliveries into atomic no-ops.
export const billingWebhookEvents = pgTable("billing_webhook_events", {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- workspace_event_bundle_usage --------------------------------------------
// Per-(workspace, calendar month) rollup. Cold store for the Redis fair-use
// counter; the middleware writes this row at increment time so a cold cache
// after Redis loss still reflects committed usage. `month` is the first day of
// the cycle in UTC. The 5M-events/month bundle is a fixed fair-use cap — no
// overage is billed, so the rollup only carries the event count.
export const workspaceEventBundleUsage = pgTable(
    "workspace_event_bundle_usage",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        month: text("month").notNull(), // YYYY-MM
        eventsCount: integer("events_count").notNull().default(0),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.workspaceId, t.month] })],
);

// --- workspace_spike_protection_settings -------------------------------------
// Per-workspace spike-protection configuration. One row per workspace; absence
// of a row means "use defaults" (multiplier 5, enabled per the global env
// flag). Cloud workspaces typically have a row from first dashboard visit;
// self-host workspaces only have rows when the operator opens the toggle.
export const workspaceSpikeProtectionSettings = pgTable("workspace_spike_protection_settings", {
    workspaceId: uuid("workspace_id")
        .primaryKey()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    thresholdMultiplier: numeric("threshold_multiplier", { precision: 6, scale: 2 })
        .notNull()
        .default("5"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- pricing_sync_state -------------------------------------------------------
// Heartbeat for the daily pricing-sync cron. Single-row table (id = 1) holding
// the timestamp of the last fully-successful run. A stale value means Bursora
// may be billing against out-of-date provider rates.
export const pricingSyncState = pgTable("pricing_sync_state", {
    id: integer("id").primaryKey(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull(),
});

// --- plans --------------------------------------------------------------------
// Single source of truth for cloud pricing. Name/description/price/interval and
// currency mirror Lemon Squeezy (synced by the DB seeder when cloud + LS keys
// are present). `config` holds Bursora-side defaults that LS never overrides
// (event-bundle size, floor/cap math, etc.). Keyed for upsert on `lsVariantId`
// so re-running the sync updates in place rather than duplicating a row.
export const plans = pgTable("plans", {
    id: uuid("id").primaryKey().defaultRandom(),
    lsProductId: text("ls_product_id").notNull(),
    lsVariantId: text("ls_variant_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    interval: text("interval").notNull(),
    intervalCount: integer("interval_count").notNull(),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
