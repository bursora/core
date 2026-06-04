/**
 * Shared input validation for pricing override write paths.
 *
 * Mirrors the DB CHECK on rate columns (non-negative) and the exclusion
 * constraint's implicit window rule (effectiveTo strictly after effectiveFrom)
 * so the API surfaces readable errors before Postgres rejects the row.
 */

export function assertNonNegativeRate(field: string, value: string): void {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${field} is not a valid decimal: ${value}`);
    }
    if (parsed < 0) {
        throw new Error(`${field} must be non-negative: ${value}`);
    }
}

export function assertEffectiveWindow(effectiveFrom: Date, effectiveTo: Date | null): void {
    if (effectiveTo !== null && effectiveTo.getTime() <= effectiveFrom.getTime()) {
        throw new Error("effectiveTo must be strictly after effectiveFrom");
    }
}

/** Full validation shared by the create and update override write paths. */
export function assertPricingInput(input: {
    readonly inputPer1mUsd: string;
    readonly outputPer1mUsd: string;
    readonly cachePer1mUsd: string | null;
    readonly effectiveFrom: Date;
    readonly effectiveTo: Date | null;
}): void {
    assertNonNegativeRate("inputPer1mUsd", input.inputPer1mUsd);
    assertNonNegativeRate("outputPer1mUsd", input.outputPer1mUsd);
    if (input.cachePer1mUsd !== null) {
        assertNonNegativeRate("cachePer1mUsd", input.cachePer1mUsd);
    }
    assertEffectiveWindow(input.effectiveFrom, input.effectiveTo);
}
