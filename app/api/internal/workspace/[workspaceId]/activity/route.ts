/**
 * GET /api/internal/workspace/[workspaceId]/activity — session-authenticated
 * activity feed.
 *
 * Returns `{ activity: [...] }` when called with no query params (same
 * payload shape as /api/v1/activity). Filter query params switch the
 * response to `{ items, nextCursor }` for the paginated Settings → Activity
 * log tab.
 *
 * Filter params (all optional):
 *   - kind: one of `event_ingested | alert_raised | key_issued | key_revoked`
 *   - severity: `info | warning | critical`
 *   - range: `24h | 7d | 30d` (overrides default 7d window)
 *   - cursor: opaque token from a prior `nextCursor`
 */

import { getRequestSession } from "@/lib/auth";
import { listActivity, listActivityPage } from "@/lib/compose/activity";
import { assertWorkspaceMember } from "@/lib/identity/server";
import {
    ACTIVITY_KIND_VALUES,
    ACTIVITY_RANGE_MS,
    ACTIVITY_RANGE_VALUES,
    ACTIVITY_SEVERITY_VALUES,
    type ActivityFilters,
} from "@/lib/metering";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ workspaceId: string }>;
}

const FilterSchema = z.object({
    kind: z.enum(ACTIVITY_KIND_VALUES).optional(),
    severity: z.enum(ACTIVITY_SEVERITY_VALUES).optional(),
    range: z.enum(ACTIVITY_RANGE_VALUES).optional(),
    cursor: z.string().min(1).optional(),
});

function hasAnyFilterParam(url: URL): boolean {
    return (
        url.searchParams.has("kind") ||
        url.searchParams.has("severity") ||
        url.searchParams.has("range") ||
        url.searchParams.has("cursor")
    );
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
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

    const url = new URL(request.url);

    if (!hasAnyFilterParam(url)) {
        const activity = await listActivity({ workspaceId });
        return NextResponse.json({ activity }, { status: 200 });
    }

    const raw = {
        kind: url.searchParams.get("kind") ?? undefined,
        severity: url.searchParams.get("severity") ?? undefined,
        range: url.searchParams.get("range") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
    };
    const parsed = FilterSchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_params" }, { status: 400 });
    }

    const filters: ActivityFilters = {
        ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
        ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
        ...(parsed.data.range !== undefined
            ? { from: new Date(Date.now() - ACTIVITY_RANGE_MS[parsed.data.range]) }
            : {}),
    };

    const page = await listActivityPage({
        workspaceId,
        filters,
        cursor: parsed.data.cursor ?? null,
    });

    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor }, { status: 200 });
}
