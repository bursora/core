/**
 * Boot-time billing credential health check.
 *
 * `env.ts` only proves the Lemon Squeezy key is *present*, not that it
 * *works*. The credential check makes one cheap authenticated probe at boot
 * so a rotated/revoked key fails loud before invoices silently break.
 *
 * Behaviour lives in the pure, fully-injected `runBillingCredentialCheck`
 * (tested directly, no env needed):
 *   - Cloud only. Self-host (`IS_CLOUD=false`) never probes the provider.
 *   - An unauthorized key logs a structured signal and throws.
 *   - A valid key resolves.
 *
 * Memoization lives in the `checkBillingCredentials` wrapper, exercised with
 * a minimal cloud env (the request-cap flags are off so `REDIS_URL` is not
 * required); the provider itself is a fake, so no network is touched.
 */

import {
    checkBillingCredentials,
    resetBillingCredentialCheckForTesting,
    runBillingCredentialCheck,
    setBillingDepsForTesting,
} from "@/lib/ee/billing/server";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { installCloudEnv } from "../support/with-cloud-env";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";
import { InMemoryPlanRepository } from "./fakes/in-memory-plan.repository";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

installCloudEnv();

let provider: FakePaymentProviderAdapter;

beforeEach(() => {
    provider = new FakePaymentProviderAdapter();
});

describe("runBillingCredentialCheck", () => {
    test("throws and logs a structured signal when the key is unauthorized", async () => {
        provider.verifyCredentialsResult = { ok: false, reason: "unauthorized" };
        const errorSpy = spyOn(console, "error").mockImplementation(() => {});

        await expect(runBillingCredentialCheck({ isCloud: true, provider })).rejects.toThrow();

        // Ops must see a greppable signal — not just a bare throw.
        const call = errorSpy.mock.calls.find((c) => c[0] === "billing.credentials.invalid");
        expect(call).toBeDefined();
        errorSpy.mockRestore();
    });

    test("resolves when the key is valid", async () => {
        provider.verifyCredentialsResult = { ok: true };
        await runBillingCredentialCheck({ isCloud: true, provider });
        expect(provider.verifyCredentialsCalls).toBe(1);
    });

    test("never probes the provider off cloud", async () => {
        await runBillingCredentialCheck({ isCloud: false, provider });
        expect(provider.verifyCredentialsCalls).toBe(0);
    });
});

describe("checkBillingCredentials memoization", () => {
    beforeEach(() => {
        resetBillingCredentialCheckForTesting();
        setBillingDepsForTesting({
            provider,
            users: new InMemoryUserBillingRepository(),
            webhookEvents: new InMemoryBillingWebhookEventStore(),
            plans: new InMemoryPlanRepository(),
            appUrl: "https://app.test",
        });
    });

    afterEach(() => {
        resetBillingCredentialCheckForTesting();
        setBillingDepsForTesting(null);
    });

    test("repeated calls probe the provider only once", async () => {
        provider.verifyCredentialsResult = { ok: true };
        await checkBillingCredentials();
        await checkBillingCredentials();
        await checkBillingCredentials();
        expect(provider.verifyCredentialsCalls).toBe(1);
    });
});
