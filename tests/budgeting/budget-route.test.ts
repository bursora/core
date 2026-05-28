/**
 * Integration-style tests for GET /api/v1/budget.
 *
 * The real route handler runs against the real `withBursoraKey` / `lookupApiKey`
 * pipeline. Auth is stubbed at the Drizzle repository boundary via
 * `mock.module`, so the real use case computes the keyHash and consults the
 * fake repository. Budgeting deps stay on the existing composition-root
 * testOverride so we can swap budgets / spend per test.
 */
import type {
    BudgetRepository,
    BudgetScopeQuery,
    RawBudget,
    SpendAggregator,
} from "@/lib/budgeting";
import { setBudgetingDepsForTesting } from "@/lib/budgeting/server";
import type { ApiKey } from "@/lib/identity";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";
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
});

const { GET } = await import("@/app/api/v1/budget/route");

class FakeBudgetRepo implements BudgetRepository {
    lastQuery: BudgetScopeQuery | null = null;
    constructor(private readonly rows: readonly RawBudget[]) {}
    async findApplicable(q: BudgetScopeQuery): Promise<readonly RawBudget[]> {
        this.lastQuery = q;
        return this.rows;
    }
    async listByWorkspace(): Promise<readonly RawBudget[]> {
        return this.rows;
    }
    async findById(): Promise<RawBudget | null> {
        return null;
    }
    async create(): Promise<RawBudget> {
        throw new Error("not used in this test");
    }
    async update(): Promise<RawBudget | null> {
        return null;
    }
    async delete(): Promise<boolean> {
        return false;
    }
}

class FakeAggregator implements SpendAggregator {
    constructor(private readonly value: number) {}
    async getSpendForScopePeriod(): Promise<number> {
        return this.value;
    }
}

const setupHarness = (opts: {
    rows: readonly RawBudget[];
    spend: number;
    knownKey?: boolean;
    ttlSeconds?: number;
}): { repo: FakeBudgetRepo; agg: FakeAggregator } => {
    const repo = new FakeBudgetRepo(opts.rows);
    const agg = new FakeAggregator(opts.spend);
    apiKeyRow =
        opts.knownKey === false
            ? null
            : {
                  id: API_KEY_ID,
                  workspaceId: WORKSPACE,
                  keyHash: "stubbed-hash",
                  name: "stub",
                  scopes: ["budget:read"],
                  createdAt: new Date("2025-01-01T00:00:00Z"),
                  revokedAt: null,
              };
    setBudgetingDepsForTesting({
        budgets: repo,
        spend: agg,
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        ...(opts.ttlSeconds === undefined ? {} : { ttlSeconds: opts.ttlSeconds }),
    });
    setSetupErrorsDepsForTesting({
        repo: new InMemorySetupErrorRepository(),
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });
    return { repo, agg };
};

const teardown = () => {
    apiKeyRow = null;
    setBudgetingDepsForTesting(null);
    setSetupErrorsDepsForTesting(null);
};

const makeRequest = (path: string, headers: Record<string, string> = {}): Request =>
    new Request(`http://localhost${path}`, {
        method: "GET",
        headers: new Headers(headers),
    });

describe("GET /api/v1/budget", () => {
    afterEach(() => teardown());

    const validHeaders = (): Record<string, string> => ({
        "x-bursora-key": PLAINTEXT,
    });

    test("401 on missing X-Bursora-Key", async () => {
        setupHarness({ rows: [], spend: 0 });
        const res = await GET(makeRequest("/api/v1/budget"));
        expect(res.status).toBe(401);
    });

    test("401 on unknown api key", async () => {
        setupHarness({ rows: [], spend: 0, knownKey: false });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        expect(res.status).toBe(401);
    });

    test("401 on malformed plaintext", async () => {
        setupHarness({ rows: [], spend: 0 });
        const res = await GET(makeRequest("/api/v1/budget", { "x-bursora-key": "garbage" }));
        expect(res.status).toBe(401);
    });

    test("200 allow=true under a block budget → ttl_s=0 so SDK pre-flights every call", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "100",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.allow).toBe(true);
        expect(body.mode).toBe("notify");
        expect(body.ttl_s).toBe(0);
        expect(typeof body.reason).toBe("string");
    });

    test("200 allow=false mode=block over a block-mode budget", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.allow).toBe(false);
        expect(body.mode).toBe("block");
    });

    test("200 allow=true mode=notify over a notify-mode budget", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "notify",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.allow).toBe(true);
        expect(body.mode).toBe("notify");
    });

    test("forwards tenant/agent/workflow query params to the budget repo", async () => {
        const { repo } = setupHarness({ rows: [], spend: 0 });
        const res = await GET(
            makeRequest(
                "/api/v1/budget?tenant=acme&agent=support&workflow=checkout",
                validHeaders(),
            ),
        );
        expect(res.status).toBe(200);
        expect(repo.lastQuery?.workspaceId).toBe(WORKSPACE);
        expect(repo.lastQuery?.tenantId).toBe("acme");
        expect(repo.lastQuery?.agentId).toBe("support");
        expect(repo.lastQuery?.workflowId).toBe("checkout");
    });

    test("missing query params resolve to null on the repo query", async () => {
        const { repo } = setupHarness({ rows: [], spend: 0 });
        await GET(makeRequest("/api/v1/budget", validHeaders()));
        expect(repo.lastQuery?.tenantId).toBeNull();
        expect(repo.lastQuery?.agentId).toBeNull();
        expect(repo.lastQuery?.workflowId).toBeNull();
    });

    test("custom ttlSeconds from container override is reflected in the response", async () => {
        setupHarness({ rows: [], spend: 0, ttlSeconds: 5 });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.ttl_s).toBe(5);
    });

    test("aggregator computed value drives the decision", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "100",
                    mode: "block",
                },
            ],
            spend: 200,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.allow).toBe(false);
        expect(body.mode).toBe("block");
    });

    test("under-budget response carries remainingUsd and ISO resetAt at the daily period boundary", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "100",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.remainingUsd).toBe(75);
        expect(body.resetAt).toBe("2025-05-11T00:00:00.000Z");
    });

    test("over-block response carries remainingUsd=0 (clamped) and resetAt", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.remainingUsd).toBe(0);
        expect(body.resetAt).toBe("2025-05-11T00:00:00.000Z");
    });

    test("over-throttle response carries remainingUsd=0 and resetAt", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "throttle",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.remainingUsd).toBe(0);
        expect(body.resetAt).toBe("2025-05-11T00:00:00.000Z");
    });

    test("over-notify response carries remainingUsd=0 and resetAt", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "notify",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.remainingUsd).toBe(0);
        expect(body.resetAt).toBe("2025-05-11T00:00:00.000Z");
    });

    test("no-budgets response carries remainingUsd=0 and empty-string resetAt sentinel", async () => {
        setupHarness({ rows: [], spend: 0 });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.remainingUsd).toBe(0);
        expect(body.resetAt).toBe("");
    });

    test("block response → ttl_s=0 so cap raises lift blocks instantly", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.allow).toBe(false);
        expect(body.mode).toBe("block");
        expect(body.ttl_s).toBe(0);
    });

    test("allow under a block budget → ttl_s=0", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "100",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.allow).toBe(true);
        expect(body.ttl_s).toBe(0);
    });

    test("over-throttle response uses long ttl_s (60) on the allow path", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "throttle",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.allow).toBe(true);
        expect(body.mode).toBe("throttle");
        expect(body.ttl_s).toBe(60);
    });

    test("over-notify response uses long ttl_s (60) on the allow path", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "daily",
                    amountUsd: "10",
                    mode: "notify",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.allow).toBe(true);
        expect(body.mode).toBe("notify");
        expect(body.ttl_s).toBe(60);
    });

    test("monthly period resetAt points at the next month start in UTC", async () => {
        setupHarness({
            rows: [
                {
                    id: "b1",
                    workspaceId: WORKSPACE,
                    scopeType: "workspace",
                    scopeId: null,
                    period: "monthly",
                    amountUsd: "100",
                    mode: "block",
                },
            ],
            spend: 25,
        });
        const res = await GET(makeRequest("/api/v1/budget", validHeaders()));
        const body = await res.json();
        expect(body.resetAt).toBe("2025-06-01T00:00:00.000Z");
    });
});
