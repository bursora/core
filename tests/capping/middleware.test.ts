/**
 * Composition tests for the unified capping middleware.
 *
 * The middleware fans out to two upstream checks — spike protection (safety
 * ramp on burst traffic) and event-bundle (monthly capacity cap). The
 * checks must run in that order; if cap is checked first, a real burst
 * leaks through because the bundle isn't yet over its cap.
 *
 * Covered:
 *   - spike hit → bundle never consulted (short-circuit).
 *   - bundle hit when spike allowed.
 *   - both allowed → decision allows the request.
 */

import { createCappingMiddleware, type CappingDecision } from "@/lib/capping/middleware";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const allowed: CappingDecision = { allowed: true };

const recordCalls = (decision: CappingDecision) => {
    const calls: { workspaceId: string; eventCount: number }[] = [];
    const apply = async (workspaceId: string, eventCount: number): Promise<CappingDecision> => {
        calls.push({ workspaceId, eventCount });
        return decision;
    };
    return { apply, calls };
};

describe("createCappingMiddleware", () => {
    test("spike hit short-circuits — bundle never consulted", async () => {
        const spike = recordCalls({ allowed: false, retryAfterMs: 30 * 60 * 1000, reason: "spike" });
        const bundle = recordCalls(allowed);

        const middleware = createCappingMiddleware({ spike: spike.apply, bundle: bundle.apply });
        const decision = await middleware.apply(WORKSPACE, 60);

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe("spike");
        expect(decision.retryAfterMs).toBe(30 * 60 * 1000);
        expect(spike.calls).toHaveLength(1);
        expect(bundle.calls).toHaveLength(0);
    });

    test("spike allows, bundle blocks → decision carries bundle reason", async () => {
        const spike = recordCalls(allowed);
        const bundle = recordCalls({ allowed: false, reason: "bundle" });

        const middleware = createCappingMiddleware({ spike: spike.apply, bundle: bundle.apply });
        const decision = await middleware.apply(WORKSPACE, 1_000);

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe("bundle");
        expect(spike.calls).toHaveLength(1);
        expect(bundle.calls).toHaveLength(1);
    });

    test("both allow → request allowed, no reason", async () => {
        const spike = recordCalls(allowed);
        const bundle = recordCalls(allowed);

        const middleware = createCappingMiddleware({ spike: spike.apply, bundle: bundle.apply });
        const decision = await middleware.apply(WORKSPACE, 10);

        expect(decision.allowed).toBe(true);
        expect(decision.reason).toBeUndefined();
        expect(spike.calls).toHaveLength(1);
        expect(bundle.calls).toHaveLength(1);
    });
});
