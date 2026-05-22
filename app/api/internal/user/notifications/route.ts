/**
 * /api/internal/user/notifications — session-authenticated, cross-workspace
 * notification feed for the bell popover.
 *
 *   GET  → { items: NotificationItem[] } across every workspace the user
 *          belongs to, unread first, newest first.
 *   POST → marks the given items as read. Body: { itemIds: string[] | "all" }.
 *          "all" marks every unread item across all workspaces.
 */

import { getRequestSession } from "@/lib/auth";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";
import { UUID_REGEX } from "@/lib/uuid";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const postBodySchema = z.object({
    itemIds: z.union([z.array(z.string().regex(UUID_REGEX)).min(1), z.literal("all")]),
});

export async function GET(): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const items = await listNotifications({ userId: session.user.id });
    return NextResponse.json({ items }, { status: 200 });
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
