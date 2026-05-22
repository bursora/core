/**
 * GET /api/v1/budget — pre-call decision endpoint.
 *
 * Headers: X-Bursora-Key: <plaintext api key> — `bsk_<workspaceId>_<32hex>`
 * Query:   tenant?, agent?, workflow?         — optional scope tags
 *          provider?, model?                  — intended call target; persisted
 *                                                on `status='blocked'` rows so
 *                                                the Blocks tab can show what
 *                                                the SDK was about to run.
 * Resp:    200 { allow, mode: 'notify'|'throttle'|'block', reason, ttl_s }
 *          401 missing, malformed, unknown, or revoked api key
 *          429 rate-limit cap hit
 *
 * Budget decisions are read-only; we apply the per-API-key rate limit but
 * not workspace spike protection (no writes happen here, no baseline to
 * protect against).
 */

import { decideBudget } from "@/lib/budgeting/server";
import { recordAuthFailure, withBursoraKey } from "@/lib/identity/with-bursora-key";
import { applyRateLimit } from "@/lib/rate-limit/middleware";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    const auth = await withBursoraKey(request, { onAuthFailure: recordAuthFailure });
    if (!auth.ok) return auth.response;

    const rateLimit = await applyRateLimit(auth.apiKey.id);
    if (rateLimit.response !== null) return rateLimit.response;

    const url = new URL(request.url);
    const tenant = url.searchParams.get("tenant");
    const agent = url.searchParams.get("agent");
    const workflow = url.searchParams.get("workflow");
    const provider = url.searchParams.get("provider");
    const model = url.searchParams.get("model");

    const decision = await decideBudget({
        workspaceId: auth.apiKey.workspaceId,
        tenantId: tenant,
        agentId: agent,
        workflowId: workflow,
        intendedProvider: provider,
        intendedModel: model,
    });

    return NextResponse.json(decision, { status: 200 });
}
