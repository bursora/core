/**
 * Rate-limit middleware for `/api/v1/*` route handlers. Two ceilings per
 * API key: 100 req/sec sustained, 1000 req/10s burst. Both must pass before
 * the route handler runs.
 *
 * The middleware returns a `NextResponse` (429) when the cap is hit, or
 * `null` when the request is allowed and should proceed. The route handler
 * checks for null and falls through to its normal work.
 *
 * Self-host installs with `BURSORA_RATE_LIMIT_ENABLED=false` bypass entirely
 * (the deps return `enabled: false` and we no-op). Cloud always evaluates.
 *
 * Fail-open: a Redis error or Lua failure logs a warning and returns
 * `response: null` (allow). Ingest stays available when Redis is down; the
 * SDK already fails open on the customer side, so the server-side limiter
 * matches that contract instead of taking down the request path.
 */

import "server-only";

import { NextResponse } from "next/server";
import { errMessage } from "../error-message";
import { rateLimitBurstKey, rateLimitDeps, rateLimitKey } from "./server";

export interface RateLimitOutcome {
    /** 429 response to return immediately, or `null` if the request is allowed. */
    readonly response: NextResponse | null;
}

export async function applyRateLimit(apiKeyId: string): Promise<RateLimitOutcome> {
    const deps = rateLimitDeps();
    if (!deps.enabled) return { response: null };

    const nowMs = deps.now().getTime();

    try {
        const sustained = await deps.limiter.check({
            key: rateLimitKey(apiKeyId),
            nowMs,
            config: deps.config,
        });
        if (!sustained.allowed) return { response: capResponse(sustained.retryAfterMs) };

        const burst = await deps.limiter.check({
            key: rateLimitBurstKey(apiKeyId),
            nowMs,
            config: deps.burstConfig,
        });
        if (!burst.allowed) return { response: capResponse(burst.retryAfterMs) };

        return { response: null };
    } catch (err) {
        console.warn("rate_limit.redis_error", { err: errMessage(err) });
        return { response: null };
    }
}

function capResponse(retryAfterMs: number): NextResponse {
    const response = NextResponse.json(
        { error: "rate_limit_exceeded", retry_after_ms: retryAfterMs },
        { status: 429 },
    );
    response.headers.set("X-Bursora-Cap-Hit", "rate");
    response.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return response;
}
