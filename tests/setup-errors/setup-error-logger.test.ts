/**
 * Verifies that every call site that previously imported `recordSetupError`
 * directly now goes through the injectable `SetupErrorLogger` seam. Tests
 * swap the logger via `setSetupErrorLoggerForTesting` and assert the recorded
 * input matches what the call site should be emitting.
 */

import type { ApiKey } from "@/lib/identity";
import { recordAuthFailure } from "@/lib/identity/with-bursora-key";
import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { setRateLimitDepsForTesting } from "@/lib/rate-limit/server";
import {
    type RecordSetupErrorInput,
    type SetupErrorLogger,
    setSetupErrorLoggerForTesting,
} from "@/lib/setup-errors/server";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

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

const { POST: postEvents } = await import("@/app/api/v1/events/route");
const { POST: postSetupError } = await import("@/app/api/v1/setup-error/route");

class RecordingLogger implements SetupErrorLogger {
    readonly calls: RecordSetupErrorInput[] = [];

    async log(input: RecordSetupErrorInput): Promise<void> {
        this.calls.push(input);
    }
}

const knownKey = (): void => {
    apiKeyRow = {
        id: API_KEY_ID,
        workspaceId: WORKSPACE,
        keyHash: "stubbed-hash",
        name: "stub",
        scopes: ["events:write"],
        createdAt: new Date("2025-01-01T00:00:00Z"),
        revokedAt: null,
    };
};

const disableRateLimit = (): void => {
    setRateLimitDepsForTesting({
        limiter: new InMemoryRateLimiter(),
        enabled: false,
        isCloud: false,
        config: { limit: 100, windowMs: 1_000 },
        burstConfig: { limit: 1_000, windowMs: 10_000 },
        now: () => new Date(),
    });
};

const teardown = () => {
    apiKeyRow = null;
    setSetupErrorLoggerForTesting(null);
    setRateLimitDepsForTesting(null);
};

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("setup error logger seam", () => {
    afterEach(() => teardown());

    test("recordAuthFailure forwards to the logger as auth_failure with the fingerprint", async () => {
        const logger = new RecordingLogger();
        setSetupErrorLoggerForTesting(logger);

        await recordAuthFailure({ hashPrefix: "deadbeef", sourceIp: "203.0.113.7" });

        expect(logger.calls).toEqual([
            { kind: "auth_failure", hashPrefix: "deadbeef", sourceIp: "203.0.113.7" },
        ]);
    });

    test("POST /api/v1/events 400 invalid body forwards to the logger with workspaceId", async () => {
        knownKey();
        disableRateLimit();
        const logger = new RecordingLogger();
        setSetupErrorLoggerForTesting(logger);

        const res = await postEvents(
            new Request("http://localhost/api/v1/events", {
                method: "POST",
                headers: { "x-bursora-key": PLAINTEXT, "content-type": "application/json" },
                body: JSON.stringify({ events: [] }),
            }),
        );
        await flush();

        expect(res.status).toBe(400);
        expect(logger.calls).toEqual([
            { kind: "ingest_invalid_body", workspaceId: WORKSPACE },
        ]);
    });

    test("POST /api/v1/setup-error 202 valid sdk_unknown_provider forwards to the logger with workspaceId", async () => {
        knownKey();
        const logger = new RecordingLogger();
        setSetupErrorLoggerForTesting(logger);

        const res = await postSetupError(
            new Request("http://localhost/api/v1/setup-error", {
                method: "POST",
                headers: { "x-bursora-key": PLAINTEXT, "content-type": "application/json" },
                body: JSON.stringify({ kind: "sdk_unknown_provider" }),
            }),
        );
        await flush();

        expect(res.status).toBe(202);
        expect(logger.calls).toEqual([
            { kind: "sdk_unknown_provider", workspaceId: WORKSPACE },
        ]);
    });
});
