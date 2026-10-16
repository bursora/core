import { getAuth } from "@/lib/auth";
import { assertEmailDomainAcceptsMail } from "@/lib/notification/email-domain";
import { SmtpMailer } from "@/lib/notification/send";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Resolver } from "node:dns/promises";
import { installCloudEnv } from "../support/with-cloud-env";

import { runIsolatedTest } from "../support/run-isolated-test";

// Production must be set before React loads, and auth/mailer caches must be isolated.
if (process.env.BURSORA_ISOLATED_TEST !== import.meta.path) {
    test("production auth domain policy", () =>
        runIsolatedTest(import.meta.path, { NODE_ENV: "production" }));
} else {
    installCloudEnv();
    let mx: ReturnType<typeof spyOn<Resolver, "resolveMx">>;
    let send: ReturnType<typeof spyOn<SmtpMailer, "send">>;
    beforeEach(() => {
        mx = spyOn(Resolver.prototype, "resolveMx");
        // Exercise the real domain policy without any SMTP/network handoff.
        send = spyOn(SmtpMailer.prototype, "send").mockImplementation(async (message) => {
            await assertEmailDomainAcceptsMail(message.to);
        });
    });
    afterEach(() => {
        mx.mockRestore();
        send.mockRestore();
    });

    async function requestCode() {
        const options = getAuth().options;
        const auth = betterAuth({
            ...options,
            baseURL: "https://app.test",
            secret: "email-domain-test-secret-at-least-32-characters",
            database: memoryAdapter({ users: [], verification: [], account: [], session: [] }),
            databaseHooks: {},
            plugins: options.plugins?.filter((plugin) => plugin.id === "email-otp"),
            rateLimit: { enabled: false },
            logger: { level: "error" },
        });
        return auth.handler(
            new Request("https://app.test/api/auth/email-otp/send-verification-otp", {
                method: "POST",
                headers: { "content-type": "application/json", origin: "https://app.test" },
                body: JSON.stringify({ email: "person@example.com", type: "sign-in" }),
            }),
        );
    }

    test("blocked domain returns HTTP 400 instead of claiming the code was sent", async () => {
        mx.mockRejectedValue(Object.assign(new Error("NXDOMAIN"), { code: "ENOTFOUND" }));
        const response = await requestCode();
        expect(response.status).toBe(400);
        expect((await response.json()).message).toBe(
            "This email domain cannot receive mail. Check the address.",
        );
        expect(send).not.toHaveBeenCalled();
    });

    test("uncertain DNS still sends the code and returns success", async () => {
        mx.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));
        const response = await requestCode();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(send).toHaveBeenCalledTimes(1);
    });
}
