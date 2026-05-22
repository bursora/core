/**
 * Optimistic revoke reducer. Verifies the status pill flips immediately
 * on click and reverts on server failure.
 */

import { revokeBadgeLabel, revokeReducer } from "@/lib/identity";
import { describe, expect, test } from "bun:test";

describe("revokeReducer", () => {
    test("begin flips active to revoking immediately", () => {
        expect(revokeReducer("active", "begin")).toBe("revoking");
    });

    test("rollback restores active on server failure", () => {
        expect(revokeReducer("revoking", "rollback")).toBe("active");
    });

    test("confirm settles to revoked", () => {
        expect(revokeReducer("revoking", "confirm")).toBe("revoked");
    });

    test("badge labels reflect server-confirmed state only", () => {
        expect(revokeBadgeLabel("active")).toBe("Active");
        expect(revokeBadgeLabel("revoking")).toBe("Revoked");
        expect(revokeBadgeLabel("revoked")).toBe("Revoked");
    });
});
