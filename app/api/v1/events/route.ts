/**
 * POST /api/v1/events — batched usage event ingestion.
 *
 * Headers: X-Bursora-Key, Content-Type: application/json
 * Body:    { "events": [ { provider, model, region?, promptTokens,
 *            completionTokens, cacheTokens?, ts, tenantId?, agentId?,
 *            workflowId?, latencyMs?, requestId? }, ... ] }
 * Resp:    202 accepted | 401 bad key | 400 malformed/empty batch |
 *          429 rate-limit or spike-protection cap hit |
 *          202 events_capped (cloud event-bundle hard cap; event not recorded)
 *
 * Cap order is per-API-key rate-limit first (one bad key shouldn't drag the
 * workspace into spike protection), then per-workspace spike protection
 * against the 7-day baseline, then the cloud event-bundle hard cap. The
 * 429s carry `X-Bursora-Cap-Hit` (rate | spike); the bundle 202 carries
 * `X-Bursora-Cap-Hit: events`.
 */

import { checkEventBundleHardCap, recordEventBundleUsage } from "@/lib/event-bundle/middleware";
import { recordAuthFailure, withBursoraKey } from "@/lib/identity/with-bursora-key";
import { logInvalidBody } from "@/lib/log-invalid-body";
import { ingestEvents } from "@/lib/metering/server";
import { applyRateLimit } from "@/lib/rate-limit/middleware";
import { recordSetupError } from "@/lib/setup-errors/server";
import { applySpikeProtection } from "@/lib/spike-protection/middleware";
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
    ts: z.iso.datetime(),
    tenantId: z.string().max(128).nullable().optional(),
    agentId: z.string().max(128).nullable().optional(),
    workflowId: z.string().max(128).nullable().optional(),
    latencyMs: z.number().int().nonnegative().nullable().optional(),
    requestId: z.string().max(128).nullable().optional(),
});

const bodySchema = z.object({
    events: z.array(eventSchema).min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
    const auth = await withBursoraKey(request, { onAuthFailure: recordAuthFailure });
    if (!auth.ok) return auth.response;

    const rateLimit = await applyRateLimit(auth.apiKey.id);
    if (rateLimit.response !== null) return rateLimit.response;

    const rawBody = await request.text();
    const parsed = parseBody(rawBody);
    if (!parsed.ok) {
        if (parsed.reason === "invalid_body") {
            logInvalidBody({
                route: "/api/v1/events",
                workspaceId: auth.apiKey.workspaceId,
                apiKeyId: auth.apiKey.id,
                issues: parsed.issues,
            });
        }
        void recordSetupError({
            kind: "ingest_invalid_body",
            workspaceId: auth.apiKey.workspaceId,
        });
        return NextResponse.json({ error: parsed.reason }, { status: 400 });
    }

    const spike = await applySpikeProtection({
        workspaceId: auth.apiKey.workspaceId,
        eventCount: parsed.value.events.length,
    });
    if (spike.response !== null) return spike.response;

    const bundle = await checkEventBundleHardCap({
        workspaceId: auth.apiKey.workspaceId,
        eventCount: parsed.value.events.length,
    });
    if (bundle.response !== null) return bundle.response;

    await ingestEvents({
        workspaceId: auth.apiKey.workspaceId,
        events: parsed.value.events.map((e) => ({
            provider: e.provider,
            model: e.model,
            region: e.region,
            promptTokens: e.promptTokens,
            completionTokens: e.completionTokens,
            cacheTokens: e.cacheTokens,
            ts: new Date(e.ts),
            tenantId: e.tenantId ?? null,
            agentId: e.agentId ?? null,
            workflowId: e.workflowId ?? null,
            latencyMs: e.latencyMs ?? null,
            requestId: e.requestId ?? null,
        })),
    });

    await recordEventBundleUsage({
        workspaceId: auth.apiKey.workspaceId,
        eventCount: parsed.value.events.length,
    });

    return NextResponse.json({ status: "accepted" }, { status: 202 });
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
