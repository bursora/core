import "server-only";

import type { z } from "zod";

/**
 * Structured `console.warn` for invalid-body Zod failures on the public v1 SDK
 * routes. The client gets back the generic `{ error: "invalid_body" }`; this
 * log is what tells the SDK author (and on-call) which field tripped which
 * constraint. Captures workspace + API key id for correlation; never the
 * payload itself.
 */
export function logInvalidBody(args: {
    readonly route: string;
    readonly workspaceId: string;
    readonly apiKeyId: string;
    readonly issues: readonly z.core.$ZodIssue[];
}): void {
    console.warn("v1.invalid_body", {
        route: args.route,
        workspaceId: args.workspaceId,
        apiKeyId: args.apiKeyId,
        // Drop the raw `input` Zod attaches to each issue — that's customer
        // payload and must never leak into application logs.
        issues: args.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            code: issue.code ?? "unknown",
            message: issue.message,
        })),
    });
}
