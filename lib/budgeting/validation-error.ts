/**
 * ValidationError — thin wrapper around ZodError raised when budget input
 * fails the structural rules (enum membership, scope/scopeId pairing,
 * non-negative amount).
 *
 * The `field` property names the offending input so server actions can
 * attach the message to the correct form control. The underlying `issues`
 * array is preserved so callers that want every issue (e.g. structured
 * logging) can read it.
 */

import type { z } from "zod";

export class ValidationError extends Error {
    readonly field: string;
    readonly issues: readonly z.core.$ZodIssue[];

    constructor(field: string, message: string, issues: readonly z.core.$ZodIssue[] = []) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
        this.issues = issues;
    }

    static fromZodError(error: z.ZodError): ValidationError {
        const [first] = error.issues;
        if (first === undefined) {
            return new ValidationError("", "Invalid input", error.issues);
        }
        const field = typeof first.path[0] === "string" ? first.path[0] : "";
        return new ValidationError(field, first.message, error.issues);
    }
}
