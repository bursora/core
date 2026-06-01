/**
 * GET /api/internal/workspace/[workspaceId]/first-event — session-authenticated
 * "has the first usage event landed yet?" signal for onboarding (the setup
 * wizard and the dashboard "send first event" widget poll this).
 *
 * Returns `{ received: boolean }`, true once the workspace has any usage event
 * (status `ok`). Scoped to the caller's workspace membership; non-members are
 * rejected. Not paywalled — onboarding must work before a subscription exists.
 */

import { getRequestSession } from "@/lib/auth";
import { assertWorkspaceMember } from "@/lib/identity/server";
import { countEventsForWorkspace } from "@/lib/metering/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;

    try {
        await assertWorkspaceMember({ workspaceId, userId: session.user.id });
    } catch {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const count = await countEventsForWorkspace({ workspaceId });
    return NextResponse.json({ received: count > 0 }, { status: 200 });
}
