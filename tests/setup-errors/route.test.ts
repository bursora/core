/**
 * Integration-style tests for POST /api/v1/setup-error.
 *
 * Behaviors covered:
 *   - 202 with valid key + `kind: "sdk_unknown_provider"` → records bucket for workspace
 *   - 401 on missing X-Bursora-Key (and records auth_unknown globally via fan-out)
 *   - 401 on unknown api key
 *   - 400 on malformed JSON body
 *   - 400 on unsupported kind
 *
 * Auth is stubbed at the Drizzle repository boundary via `mock.module` so the
 * real `withBursoraKey` / `lookupApiKey` pipeline executes;
 * `setSetupErrorsDepsForTesting` keeps the in-memory rollup so we can assert
 * on bucket rows.
 */

import type { ApiKey } from "@/lib/identity";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { InMemorySetupErrorRepository } from "./fakes/in-memory-setup-error.repository";

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
});

const { POST } = await import("@/app/api/v1/setup-error/route");

interface Harness {
    setupErrors: InMemorySetupErrorRepository;
}

const setup = (opts: { knownKey?: boolean } = {}): Harness => {
    const setupErrors = new InMemorySetupErrorRepository();
    setSetupErrorsDepsForTesting({
        repo: setupErrors,
        workspaceExists: async (id) => id === WORKSPACE,
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });

    apiKeyRow =
        opts.knownKey === false
            ? null
            : {
                  id: API_KEY_ID,
                  workspaceId: WORKSPACE,
                  keyHash: "stubbed-hash",
                  name: "stub",
                  scopes: [],
                  createdAt: new Date("2025-01-01T00:00:00Z"),
                  revokedAt: null,
              };

    return { setupErrors };
};

const teardown = () => {
    apiKeyRow = null;
    setSetupErrorsDepsForTesting(null);
};

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const makeRequest = (body: string, headers: Record<string, string> = {}): Request =>
    new Request("http://localhost/api/v1/setup-error", {
        method: "POST",
        headers: new Headers({
            "content-type": "application/json",
            ...headers,
        }),
        body,
    });

describe("POST /api/v1/setup-error", () => {
    afterEach(() => teardown());

    test("202 with valid key + kind sdk_unknown_provider → records bucket for workspace", async () => {
        const { setupErrors } = setup();

        const res = await POST(
            makeRequest(JSON.stringify({ kind: "sdk_unknown_provider" }), {
                "x-bursora-key": PLAINTEXT,
            }),
        );
        await flush();

        expect(res.status).toBe(202);
        expect(setupErrors.rows.length).toBe(1);
        expect(setupErrors.rows[0]?.workspaceId).toBe(WORKSPACE);
        expect(setupErrors.rows[0]?.category).toBe("sdk_unknown_provider");
    });

    test("401 on missing X-Bursora-Key → records auth_unknown globally via fan-out", async () => {
        const { setupErrors } = setup();

        const res = await POST(makeRequest(JSON.stringify({ kind: "sdk_unknown_provider" })));
        await flush();

        expect(res.status).toBe(401);
        expect(setupErrors.rows.length).toBe(1);
        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(setupErrors.rows[0]?.category).toBe("auth_unknown");
    });

    test("401 on unknown api key", async () => {
        const { setupErrors } = setup({ knownKey: false });

        const res = await POST(
            makeRequest(JSON.stringify({ kind: "sdk_unknown_provider" }), {
                "x-bursora-key": PLAINTEXT,
            }),
        );
        await flush();

        expect(res.status).toBe(401);
        // No sdk_unknown_provider row recorded — auth failed before the body
        // was even parsed. (The fan-out for auth_unknown lands a global bucket.)
        expect(setupErrors.rows.some((r) => r.category === "sdk_unknown_provider")).toBe(false);
    });

    test("400 on malformed JSON body", async () => {
        const { setupErrors } = setup();

        const res = await POST(makeRequest("{not json", { "x-bursora-key": PLAINTEXT }));
        await flush();

        expect(res.status).toBe(400);
        expect(setupErrors.rows.length).toBe(0);
    });

    test("400 on unsupported kind", async () => {
        const { setupErrors } = setup();

        const res = await POST(
            makeRequest(JSON.stringify({ kind: "not_a_real_kind" }), {
                "x-bursora-key": PLAINTEXT,
            }),
        );
        await flush();

        expect(res.status).toBe(400);
        expect(setupErrors.rows.length).toBe(0);
    });
});
