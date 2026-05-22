// GET /api/v1/activity — plaintext bearer auth via X-Bursora-Key.

import { listActivity } from "@/lib/compose/activity";
import { withBursoraKey } from "@/lib/identity/with-bursora-key";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    const auth = await withBursoraKey(request);
    if (!auth.ok) return auth.response;

    const activity = await listActivity({ workspaceId: auth.apiKey.workspaceId });
    return NextResponse.json({ activity }, { status: 200 });
}
