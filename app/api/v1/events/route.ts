/**
 * POST /api/v1/events — batched usage event ingestion.
 *
 * Headers: X-Bursora-Key, Content-Type: application/json
 * Body:    { "events": [ { provider, model, region?, promptTokens,
 *            completionTokens, cacheTokens?, cacheWriteTokens?,
 *            cacheWrite1hTokens?, batch?, ts, tenantId?, agentId?, workflowId?,
 *            latencyMs?, requestId? }, ... ] }
 * Resp:    202 accepted (body lists any `unpriced` provider/model pairs whose
 *          events were skipped for lack of a pricing row; the priced rows in
 *          the same batch still persist, so known spend never drops — issue
 *          #915) | 401 bad key | 400 malformed/empty batch |
 *          429 rate-limit or spike-protection
 *
 * Cap order is per-API-key rate-limit first (one bad key shouldn't drag the
 * workspace into spike protection), then spike protection (burst guard). The
 * event-bundle fair-use cap is alert-only and never blocks ingest. 429s carry
 * `X-Bursora-Cap-Hit`: `rate` (rate limit) or `spike` (spike protection).
 */

import { recordEventBundleUsage } from "@/lib/event-bundle/middleware";
import { recordAuthFailure } from "@/lib/identity/with-bursora-key";
import { withSdkAuthz } from "@/lib/identity/with-sdk-authz";
import { logInvalidBody } from "@/lib/log-invalid-body";
import { ingestEvents } from "@/lib/metering/server";
import { setupErrorLogger } from "@/lib/setup-errors/server";
import { applySpikeProtection } from "@/lib/spike-protection/middleware";
import type { SpikeDecision } from "@/lib/spike-protection/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(128),
    region: z
        .string()
        .max(50)
        .regex(/^[a-z0-9-]+$/i)
        .default("global"),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    cacheTokens: z.number().int().nonnegative().default(0),
    cacheWriteTokens: z.number().int().nonnegative().default(0),
    cacheWrite1hTokens: z.number().int().nonnegative().default(0),
    batch: z.boolean().default(false),
    ts: z.iso.datetime(),
    tenantId: z.string().max(128).nullable().optional(),
    agentId: z.string().max(128).nullable().optional(),
    workflowId: z.string().max(128).nullable().optional(),
    latencyMs: z.number().int().nonnegative().nullable().optional(),
    requestId: z.string().max(128).nullable().optional(),
    errored: z.boolean().optional(),
});

const bodySchema = z.object({
    events: z.array(eventSchema).min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
    const authz = await withSdkAuthz(request, { onAuthFailure: recordAuthFailure });
    if (!authz.allowed) return authz.response;

    const rawBody = await request.text();
    const parsed = parseBody(rawBody);
    if (!parsed.ok) {
        if (parsed.reason === "invalid_body") {
            logInvalidBody({
                route: "/api/v1/events",
                workspaceId: authz.apiKey.workspaceId,
                apiKeyId: authz.apiKey.id,
                issues: parsed.issues,
            });
        }
        void setupErrorLogger().log({
            kind: "ingest_invalid_body",
            workspaceId: authz.apiKey.workspaceId,
        });
        return NextResponse.json({ error: parsed.reason }, { status: 400 });
    }

    // Count only non-errored events toward the burst guard. The spike baseline
    // is built from `status = 'ok'` rows, so counting errored calls here would
    // measure the live minute against a baseline that excludes them — a provider
    // outage (a burst of errored calls, zero billable cost) could trip the cap
    // against traffic it never anchored on.
    const meteredCount = parsed.value.events.reduce((n, e) => (e.errored ? n : n + 1), 0);

    const decision = await applySpikeProtection({
        workspaceId: authz.apiKey.workspaceId,
        eventCount: meteredCount,
    });
    if (!decision.allowed) return capResponse(decision);

    const summary = await ingestEvents({
        workspaceId: authz.apiKey.workspaceId,
        events: parsed.value.events.map((e) => ({
            provider: e.provider,
            model: e.model,
            region: e.region,
            promptTokens: e.promptTokens,
            completionTokens: e.completionTokens,
            cacheTokens: e.cacheTokens,
            cacheWriteTokens: e.cacheWriteTokens,
            cacheWrite1hTokens: e.cacheWrite1hTokens,
            batch: e.batch,
            ts: new Date(e.ts),
            tenantId: e.tenantId ?? null,
            agentId: e.agentId ?? null,
            workflowId: e.workflowId ?? null,
            latencyMs: e.latencyMs ?? null,
            requestId: e.requestId ?? null,
            errored: e.errored ?? false,
        })),
    });

    // Issue #915: surface unpriced (provider, model) pairs to the SDK author +
    // customer ops instead of silently storing cost_usd = 0. The priced rows in
    // the same batch already persisted, so known spend never drops. The
    // structured log carries only provider/model — never the raw event payload,
    // tenant ids, or token counts — so logs never leak customer data.
    for (const { provider, model } of summary.unpriced) {
        console.warn("v1.pricing_unknown", {
            route: "/api/v1/events",
            workspaceId: authz.apiKey.workspaceId,
            apiKeyId: authz.apiKey.id,
            provider,
            model,
        });
    }

    // Bill the bundle by billable rows written, not the requested count.
    // Retried deliveries dedup in Redis (SET NX); counting them would over-bill
    // toward the plan bundle (issue #1002). Errored calls are written but carry
    // no value, so `billable` excludes them.
    await recordEventBundleUsage({
        workspaceId: authz.apiKey.workspaceId,
        eventCount: summary.billable,
    });

    const body: Record<string, unknown> = { status: "accepted" };
    if (summary.unpriced.length > 0) {
        body.unpriced = summary.unpriced;
    }
    return NextResponse.json(body, { status: 202 });
}

function capResponse(decision: SpikeDecision): NextResponse {
    const body: Record<string, unknown> = { error: "spike_protection_triggered" };
    if (decision.retryAfterMs !== undefined) {
        body.retry_after_ms = decision.retryAfterMs;
    }
    const response = NextResponse.json(body, { status: 429 });
    response.headers.set("X-Bursora-Cap-Hit", "spike");
    if (decision.retryAfterMs !== undefined) {
        response.headers.set(
            "Retry-After",
            String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
        );
    }
    return response;
}

type ParseResult =
    | { ok: true; value: z.infer<typeof bodySchema> }
    | { ok: false; reason: "invalid_json" }
    | { ok: false; reason: "invalid_body"; issues: readonly z.core.$ZodIssue[] };

function parseBody(rawBody: string): ParseResult {
    let json: unknown;
    try {
        json = JSON.parse(rawBody);
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
    const result = bodySchema.safeParse(json);
    if (!result.success) {
        return { ok: false, reason: "invalid_body", issues: result.error.issues };
    }
    return { ok: true, value: result.data };
}
