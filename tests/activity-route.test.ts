/**
 * Integration-style tests for GET /api/v1/activity.
 *
 * Auth is stubbed at the Drizzle repository boundary via `mock.module` so the
 * real `withBursoraKey` / `lookupApiKey` pipeline executes. Activity deps stay
 * on the existing composition-root testOverride.
 *
 * Behaviors covered:
 *   - 401 on missing X-Bursora-Key
 *   - 401 on unknown api key
 *   - 200 returns { activity: [...] } shape with merged items, scoped by apiKey.workspaceId
 */

import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import type { ApiKey } from "@/lib/identity";
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

const { GET } = await import("@/app/api/v1/activity/route");

interface HarnessOverrides {
    knownKey?: boolean;
    capture?: { fetchedWorkspaceId?: string };
}

const setupHarness = (overrides: HarnessOverrides = {}) => {
    apiKeyRow =
        overrides.knownKey === false
            ? null
            : {
                  id: API_KEY_ID,
                  workspaceId: WORKSPACE,
                  keyHash: "stubbed-hash",
                  seal: null,
                  last6: null,
                  name: "stub",
                  scopes: [],
                  createdAt: new Date("2025-01-01T00:00:00Z"),
                  revokedAt: null,
                  suspendedAt: null,
              };

    setActivityDepsForTesting({
        fetchEventBuckets: async (workspaceId: string) => {
            if (overrides.capture) {
                overrides.capture.fetchedWorkspaceId = workspaceId;
            }
            return [{ at: new Date("2025-05-10T11:00:00Z"), count: 7 }];
        },
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => {
            const raisedAt = new Date("2025-05-10T11:30:00Z");
            return [
                {
                    kind: "anomaly",
                    scope: { workspaceId: WORKSPACE, tenantId: null, agentId: null },
                    reason: "spike",
                    deviation: 4,
                    severity: "warning",
                    raisedAt,
                    windowStart: raisedAt,
                    windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
                    windowCostUsd: 0.42,
                },
            ];
        },
        fetchKeyEvents: async () => [],
    });
};

const teardown = () => {
    apiKeyRow = null;
    setActivityDepsForTesting(null);
};

const makeRequest = (headers: Record<string, string> = {}): Request =>
    new Request(`http://localhost/api/v1/activity`, {
        method: "GET",
        headers: new Headers(headers),
    });

describe("GET /api/v1/activity", () => {
    afterEach(() => teardown());

    test("401 on missing X-Bursora-Key", async () => {
        setupHarness();
        const res = await GET(makeRequest());
        expect(res.status).toBe(401);
    });

    test("401 on unknown api key", async () => {
        setupHarness({ knownKey: false });
        const res = await GET(makeRequest({ "x-bursora-key": PLAINTEXT }));
        expect(res.status).toBe(401);
    });

    test("200 scopes activity by apiKey.workspaceId, ignoring query params", async () => {
        const capture: { fetchedWorkspaceId?: string } = {};
        setupHarness({ capture });
        const res = await GET(
            new Request(
                `http://localhost/api/v1/activity?workspace=99999999-8888-7777-6666-555555555555`,
                {
                    method: "GET",
                    headers: new Headers({ "x-bursora-key": PLAINTEXT }),
                },
            ),
        );
        expect(res.status).toBe(200);
        expect(capture.fetchedWorkspaceId).toBe(WORKSPACE);
    });

    test("200 returns activity array with merged items", async () => {
        setupHarness();
        const res = await GET(makeRequest({ "x-bursora-key": PLAINTEXT }));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { activity: { kind: string }[] };
        expect(Array.isArray(body.activity)).toBe(true);
        expect(body.activity.map((i) => i.kind).sort()).toEqual(["alert_raised", "event_ingested"]);
    });
});
