/**
 * Security regression tests for GET /api/internal/user/export (GDPR Art. 20).
 *
 * Guards two properties the verifier flagged as untested:
 *   1. No session -> 401 (the route refuses anonymous callers).
 *   2. The serialized bundle never carries secrets. We seed the backing rows
 *      with sentinel key hashes, ciphertext seals, and Slack/Discord webhook
 *      URLs, then assert none of them survive into the response JSON. This
 *      exercises the real assembly in `lib/identity/account-export.ts`: its
 *      explicit per-field projection and `channelKinds` reduction are what
 *      strip the secrets, so the test breaks if either regresses.
 *
 * Auth, db, and metering reads are mocked via `mock.module`, matching the
 * sibling internal route tests.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

// Sentinel secrets planted in the raw rows. None may appear in the export.
const KEY_HASH = "kh_SECRET_HASH_VALUE";
const CIPHER = "ct_SECRET_CIPHER_VALUE";
const SLACK_WEBHOOK = "https://hooks.slack.com/services/T000/B000/SECRET_WEBHOOK";

type Row = Record<string, unknown>;

interface Chain {
    from(table: unknown): Chain;
    innerJoin(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(n: number): Chain;
    then(
        resolve?: (value: Row[]) => unknown,
        reject?: (reason: unknown) => unknown,
    ): Promise<unknown>;
}

const state: {
    session: { user: { id: string } } | null;
    rowsByTable: Map<unknown, Row[]>;
} = {
    session: null,
    rowsByTable: new Map(),
};

function chain(): Chain {
    let table: unknown;
    const self: Chain = {
        from(t) {
            table = t;
            return self;
        },
        innerJoin() {
            return self;
        },
        where() {
            return self;
        },
        orderBy() {
            return self;
        },
        limit() {
            return self;
        },
        then(resolve, reject) {
            return Promise.resolve(state.rowsByTable.get(table) ?? []).then(resolve, reject);
        },
    };
    return self;
}

let realAuth: Record<string, unknown>;
let realDb: Record<string, unknown>;
let realMetering: Record<string, unknown>;

beforeAll(async () => {
    realAuth = { ...(await import("@/lib/auth")) };
    realDb = { ...(await import("@/lib/db")) };
    realMetering = { ...(await import("@/lib/metering/server")) };
    mock.module("@/lib/auth", () => ({
        ...realAuth,
        getRequestSession: async () => state.session,
    }));
    mock.module("@/lib/db", () => ({
        ...realDb,
        db: () => ({ select: () => chain() }),
    }));
    mock.module("@/lib/metering/server", () => ({
        ...realMetering,
        countEventsForWorkspace: async () => 5,
        getLastUsageEventAt: async () => null,
        getSpendSeries: async () => ({ totalUsd: "1.23", totalCalls: 5 }),
    }));
});

afterAll(() => {
    mock.module("@/lib/auth", () => realAuth);
    mock.module("@/lib/db", () => realDb);
    mock.module("@/lib/metering/server", () => realMetering);
});

afterEach(() => {
    state.session = null;
    state.rowsByTable = new Map();
});

const callRoute = async () => {
    const { GET } = await import("@/app/api/internal/user/export/route");
    return GET();
};

// Plant secret-laden rows keyed by the real schema tables the export reads.
function seedSecretLadenAccount() {
    const schema = realDb.schema as typeof import("@/lib/db").schema;
    const now = new Date("2026-01-01T00:00:00.000Z");
    state.rowsByTable.set(schema.users, [
        {
            id: USER_ID,
            email: "owner@example.com",
            name: "Owner",
            emailVerified: true,
            role: "user",
            status: "active",
            createdAt: now,
            updatedAt: now,
        },
    ]);
    state.rowsByTable.set(schema.userSubscriptions, [
        { status: "active", subscribedAt: now, refundEligibleUntil: null },
    ]);
    state.rowsByTable.set(schema.workspaceMembers, [
        {
            workspaceId: WORKSPACE,
            name: "Acme",
            environment: "production",
            role: "owner",
            joinedAt: now,
            createdAt: now,
        },
    ]);
    state.rowsByTable.set(schema.apiKeys, [
        {
            id: "key-1",
            name: "prod key",
            last6: "vis123",
            scopes: ["ingest"],
            createdAt: now,
            revokedAt: null,
            suspendedAt: null,
            // Secrets that must never reach the export:
            keyHash: KEY_HASH,
            cipherText: CIPHER,
            cipherIv: "iv_SECRET",
            cipherAuthTag: "tag_SECRET",
        },
    ]);
    state.rowsByTable.set(schema.budgets, [
        {
            id: "budget-1",
            scopeType: "workspace",
            scopeId: null,
            period: "monthly",
            amountUsd: "100",
            mode: "block",
        },
    ]);
    state.rowsByTable.set(schema.alertRules, [
        {
            id: "rule-1",
            kind: "spend_spike",
            params: { threshold: 5 },
            // Raw channels carry webhook URLs / addresses; only kinds survive.
            channels: [
                { kind: "slack", url: SLACK_WEBHOOK },
                { kind: "email", address: "secret@example.com" },
            ],
        },
    ]);
}

describe("GET /api/internal/user/export security", () => {
    test("401 when there is no session", async () => {
        state.session = null;
        const res = await callRoute();
        expect(res.status).toBe(401);
    });

    test("serialized bundle contains no secret fields", async () => {
        state.session = { user: { id: USER_ID } };
        seedSecretLadenAccount();

        const res = await callRoute();
        expect(res.status).toBe(200);
        const text = await res.text();

        // The planted secret values never appear anywhere in the JSON.
        expect(text).not.toContain(KEY_HASH);
        expect(text).not.toContain(CIPHER);
        expect(text).not.toContain("iv_SECRET");
        expect(text).not.toContain("tag_SECRET");
        expect(text).not.toContain(SLACK_WEBHOOK);
        expect(text).not.toContain("hooks.slack.com");
        expect(text).not.toContain("secret@example.com");

        // Nor any secret-bearing field names / seal material.
        expect(text).not.toContain("keyHash");
        expect(text).not.toContain("cipher");
        expect(text).not.toContain("seal");
        expect(text).not.toContain("url");

        // Non-vacuous: the bundle did serialize the safe data, so the absence
        // of secrets above is a real strip, not an empty export.
        const bundle = JSON.parse(text) as {
            workspaces: { apiKeys: { last6: string }[]; alertRules: { channels: string[] }[] }[];
        };
        const ws = bundle.workspaces[0];
        expect(ws?.apiKeys[0]?.last6).toBe("vis123");
        expect(ws?.alertRules[0]?.channels).toEqual(["slack", "email"]);
    });
});
