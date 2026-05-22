/**
 * ValidationError — domain-level error raised when budget input fails the
 * structural rules (enum membership, scope/scopeId pairing, non-negative
 * amount). The `field` property names the offending input so server actions
 * can attach the message to the correct form control.
 */

export class ValidationError extends Error {
    readonly field: string;

    constructor(field: string, message: string) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
    }
}
