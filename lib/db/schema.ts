/**
 * Bursora V1 schema — Drizzle declarations.
 *
 * The `usage_events` table is partitioned by month at the SQL level (see
 * migration 0000). Drizzle has no first-class partition support yet, so we
 * declare the parent table here for typed queries and let the migration handle
 * the `PARTITION BY RANGE` and partition-creation DDL.
 */

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

// --- workspaces ---------------------------------------------------------------
// `provider_customer_id`, `provider_subscription_id`, `subscription_status`,
// `subscribed_at`, `refund_eligible_until`, `last_invoice_ref`, and
// `last_billed_month` are billing-owned columns that live on the workspace
// row to keep the webhook handler's write a single UPDATE. All are
// nullable: cloud workspaces that have never opened Checkout and every
// self-host workspace leave them empty. `subscription_status` mirrors the
// upstream provider's subscription state verbatim (e.g. `active`, `past_due`,
// `canceled`).
//
// `subscribed_at` is set the first time Checkout completes; the rollup
// cron uses it to pro-rate the first invoice. `refund_eligible_until` is
// signup + 30 days — used by the UI to surface the money-back window.
// `last_invoice_ref` carries the most recent invoice the rollup pushed
// (deep-link target). `last_billed_month` (YYYY-MM) lets the cron skip
// months it already invoiced after a retry.
export const workspaces = pgTable(
    "workspaces",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        environment: text("environment").notNull().default("prod"),
        providerCustomerId: text("provider_customer_id"),
        providerSubscriptionId: text("provider_subscription_id"),
        subscriptionStatus: text("subscription_status"),
        subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
        refundEligibleUntil: timestamp("refund_eligible_until", { withTimezone: true }),
        lastInvoiceRef: text("last_invoice_ref"),
        lastBilledMonth: text("last_billed_month"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("workspaces_provider_customer_idx").on(t.providerCustomerId),
        uniqueIndex("workspaces_last_invoice_ref_idx").on(t.lastInvoiceRef),
    ],
);

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
    (t) => [index("alerts_workspace_raised_idx").on(t.workspaceId, t.raisedAt)],
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
    (t) => [
        primaryKey({ columns: [t.id, t.ts] }),
        index("usage_events_workspace_status_ts_idx").on(t.workspaceId, t.status, t.ts),
    ],
);

// --- setup_errors ------------------------------------------------------------
// Hourly counters of SDK setup failures, surfaced on the workspace dashboard
// banner. Two distinct signals:
//   - auth_revoked / ingest_invalid_body  → per-workspace (workspace_id set)
//   - auth_unknown                        → global bucket (workspace_id NULL),
//                                            admin-only observability.
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

// --- workspace_event_bundle_settings -----------------------------------------
// Per-workspace cloud event-bundle configuration. One row per workspace; absence
// of a row means "no hard cap, default bundle policy". `hard_cap_usd_cents` is
// nullable — null disables hard-capping, a non-null value tells the middleware
// to reject events once accrued overage hits that amount this cycle.
export const workspaceEventBundleSettings = pgTable("workspace_event_bundle_settings", {
    workspaceId: uuid("workspace_id")
        .primaryKey()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    hardCapUsdCents: integer("hard_cap_usd_cents"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- workspace_event_bundle_usage --------------------------------------------
// Per-(workspace, calendar month) rollup. Used both as the cold store for the
// Redis counter and as the canonical billing source for overage. The middleware
// writes this row at increment time so a cold cache after Redis loss still
// reflects committed usage. `month` is the first day of the cycle in UTC.
export const workspaceEventBundleUsage = pgTable(
    "workspace_event_bundle_usage",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        month: text("month").notNull(), // YYYY-MM
        eventsCount: integer("events_count").notNull().default(0),
        overageCents: integer("overage_cents").notNull().default(0),
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
