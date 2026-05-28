/**
 * Activity composition must pass `includeRevoked: true` to the api-key
 * repository so revoke events still surface in the audit feed even after
 * the dashboard list switched to active-only.
 */

import { activityDeps, setActivityDepsForTesting } from "@/lib/compose/activity";
import type { ApiKey } from "@/lib/identity";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

let captured: { workspaceId: string; opts?: { readonly includeRevoked?: boolean } } | null = null;

beforeAll(() => {
    process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
    mock.module("@/lib/identity/drizzle-api-key.repository", () => ({
        DrizzleApiKeyRepository: class {
            async findByHash(): Promise<ApiKey | null> {
                return null;
            }
            async insert(): Promise<never> {
                throw new Error("not used");
            }
            async listByWorkspace(
                workspaceId: string,
                opts?: { readonly includeRevoked?: boolean },
            ): Promise<readonly ApiKey[]> {
                captured = opts === undefined ? { workspaceId } : { workspaceId, opts };
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

afterEach(() => {
    captured = null;
    setActivityDepsForTesting(null);
});

describe("activityDeps.fetchKeyEvents", () => {
    test("requests revoked keys so the activity feed can render revoke events", async () => {
        const deps = activityDeps();
        await deps.fetchKeyEvents(WORKSPACE, new Date(0));
        expect(captured).not.toBeNull();
        expect(captured?.workspaceId).toBe(WORKSPACE);
        expect(captured?.opts?.includeRevoked).toBe(true);
    });
});
