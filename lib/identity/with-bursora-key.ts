/**
 * Bearer-auth helper for `/api/v1/*` routes.
 *
 * Every public `/api/v1/*` route runs the same dance: read `X-Bursora-Key`,
 * look up the workspace, 401 on miss. Routes that want to surface failures
 * in the dashboard pass `onAuthFailure`; the helper invokes it with the
 * parsed workspace id and an eight-char hash prefix for log correlation.
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
import { apiKeyHashPrefix, parseApiKeyPlaintext } from "./api-key.crypto";
import { lookupApiKey } from "./server";

export interface AuthFailureInfo {
    readonly workspaceId: string | null;
    readonly hashPrefix: string | null;
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
            void opts.onAuthFailure({ workspaceId: null, hashPrefix: null });
        }
        return { ok: false, response: unauthorized() };
    }

    const apiKey = await lookupApiKey(plaintext);
    if (apiKey === null) {
        if (opts.onAuthFailure !== undefined) {
            const parsed = parseApiKeyPlaintext(plaintext);
            void opts.onAuthFailure({
                workspaceId: parsed?.workspaceId ?? null,
                hashPrefix: apiKeyHashPrefix(plaintext),
            });
        }
        return { ok: false, response: unauthorized() };
    }

    return { ok: true, apiKey };
}

/**
 * Default `onAuthFailure` handler: records an `auth_failure` setup-error so
 * the workspace owner sees misconfigured SDKs in the dashboard.
 */
export function recordAuthFailure(info: AuthFailureInfo): Promise<void> {
    return recordSetupError({
        kind: "auth_failure",
        workspaceId: info.workspaceId,
        hashPrefix: info.hashPrefix,
    });
}

function unauthorized(): NextResponse {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
