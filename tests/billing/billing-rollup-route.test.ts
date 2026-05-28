/**
 * Billing-rollup cron route — boot credential check wiring.
 *
 * The monthly rollup is the operation that actually spends the Lemon Squeezy
 * key (it posts usage records). The route runs `checkBillingCredentials`
 * first so a rotated/revoked key fails the cron loudly instead of silently
 * dropping that month's invoice. The check is memoized, so it costs one
 * probe per process, not one per run.
 */

import {
    resetBillingCredentialCheckForTesting,
    setBillingDepsForTesting,
} from "@/lib/ee/billing/server";
import { GET } from "@/lib/ee/routes/billing-rollup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { installCloudEnv } from "../support/with-cloud-env";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";
import { InMemoryEventBundleRollupRepository } from "./fakes/in-memory-event-bundle-rollup.repository";
import { InMemoryTrackedSpendRepository } from "./fakes/in-memory-tracked-spend.repository";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

installCloudEnv();

let provider: FakePaymentProviderAdapter;

const authorized = (): Request =>
    new Request("https://app.test/api/cron/billing-rollup", {
        method: "GET",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

beforeEach(() => {
    resetBillingCredentialCheckForTesting();
    provider = new FakePaymentProviderAdapter();
    setBillingDepsForTesting({
        provider,
        workspaces: new InMemoryWorkspaceBillingRepository(),
        webhookEvents: new InMemoryBillingWebhookEventStore(),
        trackedSpend: new InMemoryTrackedSpendRepository(),
        eventBundleRollup: new InMemoryEventBundleRollupRepository(),
        variantIdTeam: "variant_team",
        appUrl: "https://app.test",
    });
});

afterEach(() => {
    resetBillingCredentialCheckForTesting();
    setBillingDepsForTesting(null);
});

describe("/api/cron/billing-rollup credential check", () => {
    test("runs the rollup when the key authenticates", async () => {
        provider.verifyCredentialsResult = { ok: true };
        const response = await GET(authorized());
        expect(response.status).toBe(200);
        expect(provider.verifyCredentialsCalls).toBe(1);
    });

    test("fails loud when the key is unauthorized, before reporting any usage", async () => {
        provider.verifyCredentialsResult = { ok: false, reason: "unauthorized" };
        const errorSpy = spyOn(console, "error").mockImplementation(() => {});

        await expect(GET(authorized())).rejects.toThrow();

        // The rollup must not have touched the provider's usage API on a dead key.
        expect(provider.reportUsageCalls).toHaveLength(0);
        errorSpy.mockRestore();
    });
});
