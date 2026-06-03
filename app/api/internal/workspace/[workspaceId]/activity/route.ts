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
 *   - from / to: ISO 8601 instants bounding the window; override `range`
 *   - cursor: opaque token from a prior `nextCursor`
 */

import { getRequestSession } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import { listActivity, listActivityPage } from "@/lib/compose/activity";
import { assertWorkspaceMember } from "@/lib/identity/server";
import {
    ACTIVITY_KIND_VALUES,
    ACTIVITY_RANGE_MS,
    ACTIVITY_RANGE_VALUES,
    ACTIVITY_SEVERITY_VALUES,
    type ActivityFilters,
} from "@/lib/metering";
import { getRequestTimeZone } from "@/lib/time/request-tz";
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
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().max(500).regex(/^\d+$/).optional(),
});

function hasAnyFilterParam(url: URL): boolean {
    return (
        url.searchParams.has("kind") ||
        url.searchParams.has("severity") ||
        url.searchParams.has("range") ||
        url.searchParams.has("from") ||
        url.searchParams.has("to") ||
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

    // Activity (incl. alert_raised rows) is gated workspace data. The Settings
    // activity tab is paywalled in the UI; this is its backing endpoint, so a
    // locked cloud workspace is denied here too — no direct-hit bypass.
    if (await cloudWorkspaceLocked(workspaceId)) {
        return NextResponse.json({ error: "subscription_required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const tz = await getRequestTimeZone();

    if (!hasAnyFilterParam(url)) {
        const activity = await listActivity({ workspaceId, tz });
        return NextResponse.json({ activity }, { status: 200 });
    }

    const raw = {
        kind: url.searchParams.get("kind") ?? undefined,
        severity: url.searchParams.get("severity") ?? undefined,
        range: url.searchParams.get("range") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
    };
    const parsed = FilterSchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_params" }, { status: 400 });
    }

    // Explicit from/to win over range; range supplies a from when neither given.
    const rangeFrom =
        parsed.data.range !== undefined
            ? new Date(Date.now() - ACTIVITY_RANGE_MS[parsed.data.range])
            : undefined;
    const from = parsed.data.from !== undefined ? new Date(parsed.data.from) : rangeFrom;
    const to = parsed.data.to !== undefined ? new Date(parsed.data.to) : undefined;

    const filters: ActivityFilters = {
        ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
        ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
    };

    const page = await listActivityPage({
        workspaceId,
        filters,
        cursor: parsed.data.cursor ?? null,
        tz,
    });

    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor }, { status: 200 });
}
