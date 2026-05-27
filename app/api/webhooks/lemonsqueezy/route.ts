import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ossBuild = process.env.OSS_BUILD === "true";

const eePromise = ossBuild ? null : import("@/lib/ee/routes/lemonsqueezy-webhook");

export async function POST(request: Request): Promise<NextResponse> {
    if (eePromise === null) {
        return NextResponse.json({ error: "billing_disabled_in_oss_build" }, { status: 404 });
    }
    const ee = await eePromise;
    return ee.POST(request);
}
