/**
 * POST /api/v1/test — auth handshake the SDK calls at init.
 *
 * Contract:
 *   Headers
 *     X-Bursora-Key: <plaintext api key>    — `bsk_<workspaceId>_<32hex>`
 *   Resp:
 *     200 { workspace_id, ok: true }
 *     401 missing, malformed, unknown, or revoked api key
 */

import { withBursoraKey } from "@/lib/identity/with-bursora-key";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
    const auth = await withBursoraKey(request);
    if (!auth.ok) return auth.response;

    return NextResponse.json(
        {
            workspace_id: auth.apiKey.workspaceId,
            ok: true,
        },
        { status: 200 },
    );
}
