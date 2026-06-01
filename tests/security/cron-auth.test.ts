/**
 * Locks the cron bearer-token gate. `assertCronAuthorized` accepts only
 * `Authorization: Bearer <CRON_SECRET>` and throws a 401 Response otherwise.
 * The byte-length guard must reject non-ASCII headers without letting
 * `timingSafeEqual` throw on mismatched buffer lengths. CRON_SECRET comes from
 * the cloud-env helper ("test-cron"); node:crypto runs for real.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { describe, expect, test } from "bun:test";
import { installCloudEnv } from "../support/with-cloud-env";

installCloudEnv();

const request = (authorization?: string): Request =>
    new Request("https://app.test/api/cron/x", {
        headers: authorization === undefined ? {} : { authorization },
    });

const catchThrown = (req: Request): unknown => {
    try {
        assertCronAuthorized(req);
        return undefined;
    } catch (thrown: unknown) {
        return thrown;
    }
};

describe("assertCronAuthorized", () => {
    test("returns void for a correct bearer token", () => {
        expect(assertCronAuthorized(request("Bearer test-cron"))).toBeUndefined();
    });

    test("throws a 401 Response when the header is missing", () => {
        const thrown = catchThrown(request());
        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(401);
    });

    test("throws a 401 Response for a wrong token", () => {
        const thrown = catchThrown(request("Bearer nope"));
        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(401);
    });

    test("throws a 401 Response for a correct-length but different token", () => {
        // "Bearer wrongcron" is the same 16 bytes as "Bearer test-cron",
        // so the length guard passes and timingSafeEqual does the rejecting.
        const thrown = catchThrown(request("Bearer wrongcron"));
        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(401);
    });

    test("rejects a non-ASCII header on the byte-length path without a crypto throw", () => {
        // "Bearer tést-cron" has 16 chars but 17 bytes (é = 2 bytes), so the
        // byte-length guard rejects before timingSafeEqual sees mismatched
        // buffers — proving the comment's reason holds.
        const thrown = catchThrown(request("Bearer tést-cron"));
        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(401);
    });
});
