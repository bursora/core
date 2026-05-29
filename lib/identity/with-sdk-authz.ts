/**
 * SDK route authz wrapper. Composes the two gates every `/api/v1/*` SDK
 * route runs — bearer auth (`X-Bursora-Key`) plus per-API-key rate limit —
 * into a single call so route handlers branch on `allowed` once instead of
 * threading two `if (!ok) return response` checks each.
 *
 * Spike protection lives in the spike-protection middleware at event ingest
 * only; it is intentionally not part of the authz pipeline.
 *
 * Usage:
 *
 * ```ts
 * const authz = await withSdkAuthz(request, { onAuthFailure: recordAuthFailure });
 * if (!authz.allowed) return authz.response;
 * // authz.apiKey.workspaceId, authz.rateLimit
 * ```
 */

import "server-only";

import type { NextResponse } from "next/server";
import { applyRateLimit, type RateLimitOutcome } from "../rate-limit/middleware";
import type { ApiKeyLookup } from "./api-key";
import { withBursoraKey, type WithBursoraKeyOptions } from "./with-bursora-key";

export type SdkAuthzOptions = WithBursoraKeyOptions;

export interface SdkAuthzAllowed {
    readonly allowed: true;
    readonly apiKey: ApiKeyLookup;
    readonly rateLimit: RateLimitOutcome;
}

export interface SdkAuthzDenied {
    readonly allowed: false;
    readonly response: NextResponse;
}

export async function withSdkAuthz(
    request: Request,
    opts: SdkAuthzOptions = {},
): Promise<SdkAuthzAllowed | SdkAuthzDenied> {
    const auth = await withBursoraKey(request, opts);
    if (!auth.ok) return { allowed: false, response: auth.response };

    const rateLimit = await applyRateLimit(auth.apiKey.id);
    if (rateLimit.response !== null) {
        return { allowed: false, response: rateLimit.response };
    }

    return { allowed: true, apiKey: auth.apiKey, rateLimit };
}
