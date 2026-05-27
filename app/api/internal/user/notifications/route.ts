/**
 * /api/internal/user/notifications — session-authenticated, cross-workspace
 * notification feed for the bell popover.
 *
 *   GET  → { items: NotificationItem[], nextCursor: string | null } across
 *          every workspace the user belongs to, unread first, newest first.
 *          Query params: `limit` (1-100, default 50), `cursor` (opaque).
 *   POST → marks the given items as read. Body: { itemIds: string[] | "all" }.
 *          "all" marks every unread item across all workspaces.
 */

import { getRequestSession } from "@/lib/auth";
import {
    listNotificationsPage,
    markNotificationsRead,
    MAX_NOTIFICATIONS_PAGE_LIMIT,
} from "@/lib/notifications";
import { UUID_REGEX } from "@/lib/uuid";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_NOTIFICATIONS_PAGE_LIMIT).optional(),
    cursor: z.string().min(1).max(200).optional(),
});

const postBodySchema = z.object({
    itemIds: z.union([z.array(z.string().regex(UUID_REGEX)).min(1), z.literal("all")]),
});

export async function GET(request: Request): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_params" }, { status: 400 });
    }

    const page = await listNotificationsPage({
        userId: session.user.id,
        ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    });
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor }, { status: 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let json: unknown;
    try {
        json = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = postBodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    await markNotificationsRead({ userId: session.user.id, itemIds: parsed.data.itemIds });
    return NextResponse.json({ status: "ok" }, { status: 200 });
}
