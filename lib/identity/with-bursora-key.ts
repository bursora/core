/**
 * Bearer-auth helper for `/api/v1/*` routes.
 *
 * Every public `/api/v1/*` route runs the same dance: read `X-Bursora-Key`,
 * look up the workspace, 401 on miss. Routes that want to surface failures
 * in the dashboard pass `onAuthFailure`; the helper invokes it with a
 * non-attributable fingerprint (hash prefix + source IP) so a forged key
 * carrying a victim's workspace fragment cannot pollute their bucket.
 *
 * Usage:
 *
 * ```ts
 * const auth = await withBursoraKey(request, { onAuthFailure: recordAuthFailure });
 * if (!auth.ok) return auth.response;
 * // auth.apiKey.workspaceId
 * ```
 */

import "server-only";

import { NextResponse } from "next/server";
import { recordSetupError } from "../setup-errors/server";
import type { ApiKeyLookup } from "./api-key";
import { apiKeyHashPrefix } from "./api-key.crypto";
import { lookupApiKey } from "./server";

export interface AuthFailureInfo {
    /** Eight-char SHA-256 prefix of the offered plaintext; null when the header was missing. */
    readonly hashPrefix: string | null;
    /** Best-effort client IP from `x-forwarded-for` (first hop) or `x-real-ip`; null when neither header was set. */
    readonly sourceIp: string | null;
}

export interface WithBursoraKeyOptions {
    readonly onAuthFailure?: (info: AuthFailureInfo) => void | Promise<void>;
}

export type WithBursoraKeyResult =
    | { readonly ok: true; readonly apiKey: ApiKeyLookup }
    | { readonly ok: false; readonly response: NextResponse };

export async function withBursoraKey(
    request: Request,
    opts: WithBursoraKeyOptions = {},
): Promise<WithBursoraKeyResult> {
    const plaintext = request.headers.get("x-bursora-key");
    if (plaintext === null) {
        if (opts.onAuthFailure !== undefined) {
            void opts.onAuthFailure({
                hashPrefix: null,
                sourceIp: extractSourceIp(request),
            });
        }
        return { ok: false, response: unauthorized() };
    }

    const apiKey = await lookupApiKey(plaintext);
    if (apiKey === null) {
        if (opts.onAuthFailure !== undefined) {
            void opts.onAuthFailure({
                hashPrefix: apiKeyHashPrefix(plaintext),
                sourceIp: extractSourceIp(request),
            });
        }
        return { ok: false, response: unauthorized() };
    }

    return { ok: true, apiKey };
}

/**
 * Default `onAuthFailure` handler: records an `auth_failure` setup-error
 * against the global bucket. We never attribute these to a workspace because
 * the offered key may carry a forged workspace fragment.
 */
export function recordAuthFailure(info: AuthFailureInfo): Promise<void> {
    return recordSetupError({
        kind: "auth_failure",
        hashPrefix: info.hashPrefix,
        sourceIp: info.sourceIp,
    });
}

/**
 * Pulls a best-effort client IP from common proxy headers. `x-forwarded-for`
 * may carry a comma-separated chain (`client, proxy1, proxy2`); the first
 * entry is the original client. Falls back to `x-real-ip`. Returns null when
 * neither header is set — no header forging is rejected here; the value is
 * only ever used as a log/fingerprint correlate.
 */
function extractSourceIp(request: Request): string | null {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded !== null) {
        const first = forwarded.split(",", 1)[0]?.trim();
        if (first !== undefined && first.length > 0) return first;
    }
    const real = request.headers.get("x-real-ip");
    if (real !== null && real.trim().length > 0) return real.trim();
    return null;
}

function unauthorized(): NextResponse {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
