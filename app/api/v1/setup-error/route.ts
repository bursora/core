/**
 * POST /api/v1/setup-error — SDK-side setup error reporter.
 *
 * Headers: X-Bursora-Key, Content-Type: application/json
 * Body:    { "kind": "sdk_unknown_provider" }
 * Resp:    202 accepted | 401 bad key | 400 malformed/unsupported kind
 *
 * Mirrors the auth pattern from /api/v1/events: X-Bursora-Key validates against
 * the metering composition root, then the setup-error logger fans out to the
 * dashboard rollup + workspace-member notifications. Fire-and-forget so the
 * SDK never waits on Bursora before throwing the wrap() error.
 */

import { recordAuthFailure, withBursoraKey } from "@/lib/identity/with-bursora-key";
import { logInvalidBody } from "@/lib/log-invalid-body";
import { setupErrorLogger } from "@/lib/setup-errors/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    kind: z.literal("sdk_unknown_provider"),
});

export async function POST(request: Request): Promise<NextResponse> {
    const auth = await withBursoraKey(request, { onAuthFailure: recordAuthFailure });
    if (!auth.ok) return auth.response;

    const rawBody = await request.text();
    const parsed = parseBody(rawBody);
    if (!parsed.ok) {
        if (parsed.reason === "invalid_body") {
            logInvalidBody({
                route: "/api/v1/setup-error",
                workspaceId: auth.apiKey.workspaceId,
                apiKeyId: auth.apiKey.id,
                issues: parsed.issues,
            });
        }
        return NextResponse.json({ error: parsed.reason }, { status: 400 });
    }

    void setupErrorLogger().log({
        kind: parsed.value.kind,
        workspaceId: auth.apiKey.workspaceId,
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
