import { getRequestSession } from "@/lib/auth";
import { exportAccountData } from "@/lib/identity/account-export";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GDPR data export (Art. 20 portability). Returns the authenticated user's own
 * data bundle as a JSON download. Self-scoped — `exportAccountData` only reads
 * workspaces the user is a member of, and never includes secrets.
 */
export async function GET(): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const data = await exportAccountData(session.user.id);
    if (!data) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="bursora-data-export.json"',
            "Cache-Control": "no-store",
        },
    });
}
