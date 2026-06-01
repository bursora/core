/**
 * Setup-error fan-out tests against the real v1 route handlers.
 *
 * Auth is stubbed at the Drizzle repository boundary via `mock.module` so the
 * real `withBursoraKey` / `lookupApiKey` pipeline executes. Budgeting and
 * metering deps stay on the existing composition-root testOverrides;
 * `setSetupErrorsDepsForTesting` keeps the in-memory rollup so we can assert
 * on bucket rows.
 */

import type {
    BudgetRepository,
    BudgetScopeQuery,
    RawBudget,
    SpendAggregator,
} from "@/lib/budgeting";
import { setBudgetingDepsForTesting } from "@/lib/budgeting/server";
import type { ApiKey } from "@/lib/identity";
import { setMeteringDepsForTesting } from "@/lib/metering/server";
import {
    setSetupErrorLoggerForTesting,
    setSetupErrorsDepsForTesting,
} from "@/lib/setup-errors/server";
import { InMemoryUsageEventRepository } from "@/tests/metering/fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "@/tests/metering/fakes/stub-pricing.repository";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { InMemorySetupErrorRepository } from "./fakes/in-memory-setup-error.repository";
import { TrackingSetupErrorLogger } from "./tracking-logger";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const PLAINTEXT = `bsk_${WORKSPACE}_${"a".repeat(32)}`;

let apiKeyRow: ApiKey | null = null;

beforeAll(() => {
    mock.module("@/lib/identity/drizzle-api-key.repository", () => ({
        DrizzleApiKeyRepository: class {
            async findByHash(_keyHash: string): Promise<ApiKey | null> {
                return apiKeyRow;
            }
            async insert(): Promise<never> {
                throw new Error("not used in this test");
            }
            async listByWorkspace(): Promise<readonly ApiKey[]> {
                return [];
            }
            async rename(): Promise<boolean> {
                return false;
            }
            async revoke(): Promise<boolean> {
                return false;
            }
        },
    }));
    mock.module("@/lib/identity/drizzle-member.repository", () => ({
        DrizzleMemberRepository: class {
            async findOwnerUserRole(): Promise<string | null> {
                return "user";
            }
        },
    }));
});

const { GET: getBudget } = await import("@/app/api/v1/budget/route");
const { POST: postEvents } = await import("@/app/api/v1/events/route");

class FakeBudgetRepo implements BudgetRepository {
    async findApplicable(_q: BudgetScopeQuery): Promise<readonly RawBudget[]> {
        return [];
    }
    async listByWorkspace(): Promise<readonly RawBudget[]> {
        return [];
    }
    async findById(): Promise<RawBudget | null> {
        return null;
    }
    async create(): Promise<RawBudget> {
        throw new Error("not used");
    }
    async update(): Promise<RawBudget | null> {
        return null;
    }
    async delete(): Promise<boolean> {
        return false;
    }
}

class FakeAggregator implements SpendAggregator {
    async getSpendForScopePeriod(): Promise<number> {
        return 0;
    }
}

interface Harness {
    setupErrors: InMemorySetupErrorRepository;
    logger: TrackingSetupErrorLogger;
}

const setup = (opts: { existingWorkspaces?: readonly string[] } = {}): Harness => {
    const existing = new Set(opts.existingWorkspaces ?? [WORKSPACE]);
    const setupErrors = new InMemorySetupErrorRepository();
    setSetupErrorsDepsForTesting({
        repo: setupErrors,
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });
    const logger = new TrackingSetupErrorLogger();
    setSetupErrorLoggerForTesting(logger);

    apiKeyRow = existing.has(WORKSPACE)
        ? {
              id: API_KEY_ID,
              workspaceId: WORKSPACE,
              keyHash: "stubbed-hash",
              seal: null,
              last6: null,
              name: "stub",
              scopes: ["events:write"],
              createdAt: new Date("2025-01-01T00:00:00Z"),
              revokedAt: null,
          }
        : null;

    setBudgetingDepsForTesting({
        budgets: new FakeBudgetRepo(),
        spend: new FakeAggregator(),
        now: () => new Date("2025-05-10T12:00:00.000Z"),
    });

    setMeteringDepsForTesting({
        eventsRepo: new InMemoryUsageEventRepository(),
        pricingRepo: new StubPricingRepository(),
    });

    return { setupErrors, logger };
};

const teardown = () => {
    apiKeyRow = null;
    setBudgetingDepsForTesting(null);
    setMeteringDepsForTesting(null);
    setSetupErrorsDepsForTesting(null);
    setSetupErrorLoggerForTesting(null);
};

describe("setup-error route hooks", () => {
    afterEach(() => teardown());

    test("GET /api/v1/budget 401 missing key → records auth_unknown globally", async () => {
        const { setupErrors, logger } = setup();

        const res = await getBudget(new Request("http://localhost/api/v1/budget"));
        await logger.settled();

        expect(res.status).toBe(401);
        expect(setupErrors.rows.length).toBe(1);
        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(setupErrors.rows[0]?.category).toBe("auth_unknown");
    });

    test("GET /api/v1/budget 401 with key whose workspace fragment matches a real workspace → still global auth_unknown (no victim pollution)", async () => {
        const { setupErrors, logger } = setup();
        // Key fragment matches an existing workspace, but the api_keys row
        // is missing. Pre-fix this attributed the bucket to that workspace
        // (an unverified field), letting a forged key trigger banners on a
        // victim's dashboard. Now the bucket always lands in the global
        // auth_unknown counter.
        apiKeyRow = null;

        const res = await getBudget(
            new Request("http://localhost/api/v1/budget", {
                headers: { "x-bursora-key": PLAINTEXT },
            }),
        );
        await logger.settled();

        expect(res.status).toBe(401);
        expect(setupErrors.rows.length).toBe(1);
        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(setupErrors.rows[0]?.category).toBe("auth_unknown");
    });

    test("POST /api/v1/events 401 missing key → records auth_unknown globally", async () => {
        const { setupErrors, logger } = setup();

        const res = await postEvents(
            new Request("http://localhost/api/v1/events", {
                method: "POST",
                body: "{}",
            }),
        );
        await logger.settled();

        expect(res.status).toBe(401);
        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(setupErrors.rows[0]?.category).toBe("auth_unknown");
    });

    test("POST /api/v1/events 400 after valid key → records ingest_invalid_body for workspace", async () => {
        const { setupErrors, logger } = setup();

        const res = await postEvents(
            new Request("http://localhost/api/v1/events", {
                method: "POST",
                headers: { "x-bursora-key": PLAINTEXT, "content-type": "application/json" },
                body: JSON.stringify({ events: [] }),
            }),
        );
        await logger.settled();

        expect(res.status).toBe(400);
        expect(setupErrors.rows.length).toBe(1);
        expect(setupErrors.rows[0]?.workspaceId).toBe(WORKSPACE);
        expect(setupErrors.rows[0]?.category).toBe("ingest_invalid_body");
    });

    test("POST /api/v1/events with bsk_ for nonexistent workspace → auth_unknown global", async () => {
        const { setupErrors, logger } = setup({ existingWorkspaces: [] });

        const res = await postEvents(
            new Request("http://localhost/api/v1/events", {
                method: "POST",
                headers: { "x-bursora-key": PLAINTEXT },
                body: "{}",
            }),
        );
        await logger.settled();

        expect(res.status).toBe(401);
        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(setupErrors.rows[0]?.category).toBe("auth_unknown");
    });

    test("recorder failure does not poison the response (fire-and-forget)", async () => {
        setSetupErrorsDepsForTesting({
            repo: {
                incrementBucket: async (): Promise<{ created: boolean }> => {
                    throw new Error("db down");
                },
                sumByCategorySince: async () => [],
            },
            now: () => new Date(),
            notifications: new InMemoryNotificationsRepository(),
            listMemberUserIds: async () => [],
        });
        setBudgetingDepsForTesting({
            budgets: new FakeBudgetRepo(),
            spend: new FakeAggregator(),
            now: () => new Date(),
        });
        const logger = new TrackingSetupErrorLogger();
        setSetupErrorLoggerForTesting(logger);

        const res = await getBudget(new Request("http://localhost/api/v1/budget"));
        await logger.settled();

        // The 401 still lands cleanly.
        expect(res.status).toBe(401);
    });
});
