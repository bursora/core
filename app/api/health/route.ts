/**
 * GET /api/health — liveness probe the deploy polls after a restart. Shallow by
 * design: a 200 means the process booted and serves routes. No DB check, so an
 * unrelated Postgres blip can't wedge a deploy.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
    return NextResponse.json({ ok: true }, { status: 200 });
}
