/**
 * POST /api/v1/test — auth handshake the SDK calls at init.
 *
 * Contract:
 *   Headers
 *     X-Bursora-Key: <plaintext api key>    — `bsk_<workspaceId>_<32hex>`
 *   Resp:
 *     200 { workspace_id, ok: true }
 *     401 missing, malformed, unknown, or revoked api key
 *     429 rate-limit cap hit
 */

import { recordAuthFailure } from "@/lib/identity/with-bursora-key";
import { withSdkAuthz } from "@/lib/identity/with-sdk-authz";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
    const authz = await withSdkAuthz(request, { onAuthFailure: recordAuthFailure });
    if (!authz.allowed) return authz.response;

    return NextResponse.json(
        {
            workspace_id: authz.apiKey.workspaceId,
            ok: true,
        },
        { status: 200 },
    );
}
