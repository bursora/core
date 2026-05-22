/**
 * Smoke test for the published `@bursora/sdk` package.
 *
 * Skipped unless `NPM_PUBLISHED_VERSION` is set, so the regular `bun test`
 * sweep doesn't hit the npm registry. CI runs this explicitly after a publish:
 *
 *   NPM_PUBLISHED_VERSION=0.1.0 bun test tests/sdk-published.smoke.ts
 *
 * Stubs `globalThis.fetch` so no real provider or Bursora call occurs.
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = process.env.NPM_PUBLISHED_VERSION;

const describeOrSkip = VERSION ? describe : describe.skip;

describeOrSkip("@bursora/sdk published smoke", () => {
    test(
        "installs from npm and exercises wrap(openai) under withTags",
        async () => {
            const tempDir = await mkdtemp(join(tmpdir(), "bursora-sdk-smoke-"));
            try {
                await writeFile(
                    join(tempDir, "package.json"),
                    JSON.stringify(
                        {
                            name: "bursora-sdk-smoke",
                            version: "0.0.0",
                            private: true,
                            type: "module",
                        },
                        null,
                        2,
                    ),
                );

                const install = Bun.spawn(
                    ["npm", "install", "--silent", `@bursora/sdk@${VERSION}`],
                    { cwd: tempDir, stdout: "pipe", stderr: "pipe" },
                );
                const installCode = await install.exited;
                if (installCode !== 0) {
                    throw new Error(
                        `npm install failed: ${await new Response(install.stderr).text()}`,
                    );
                }

                const sdkPath = join(
                    tempDir,
                    "node_modules",
                    "@bursora",
                    "sdk",
                    "dist",
                    "index.mjs",
                );
                const sdk = (await import(sdkPath)) as {
                    wrap: typeof import("@bursora/sdk").wrap;
                    withTags: typeof import("@bursora/sdk").withTags;
                    BudgetExceededError: typeof import("@bursora/sdk").BudgetExceededError;
                };

                const calls: unknown[] = [];
                const fakeClient = {
                    chat: {
                        completions: {
                            create: async (args: unknown) => {
                                calls.push(args);
                                return {
                                    usage: { prompt_tokens: 10, completion_tokens: 5 },
                                };
                            },
                        },
                    },
                    responses: {
                        create: async () => ({
                            usage: { input_tokens: 0, output_tokens: 0 },
                        }),
                    },
                    embeddings: {
                        create: async () => ({
                            usage: { prompt_tokens: 0, total_tokens: 0 },
                        }),
                    },
                };

                const allowDecision = {
                    allow: true,
                    mode: "notify" as const,
                    reason: "ok",
                    ttl_s: 60,
                };
                const originalFetch = globalThis.fetch;
                globalThis.fetch = (async (input: RequestInfo | URL) => {
                    const url =
                        typeof input === "string" ? input : (input as URL | Request).toString();
                    if (url.includes("/api/v1/budget")) {
                        return new Response(JSON.stringify(allowDecision), { status: 200 });
                    }
                    return new Response("", { status: 202 });
                }) as typeof fetch;
                const wrapped = sdk.wrap(fakeClient, {
                    apiKey: "bsk_smoke_smoke",
                    endpoint: "https://app.bursora.com",
                });

                await sdk.withTags({ agent_id: "smoke" }, async () => {
                    await wrapped.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: "hi" }],
                    });
                });

                expect(calls.length).toBe(1);
                expect(typeof sdk.BudgetExceededError).toBe("function");
                globalThis.fetch = originalFetch;
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        },
        { timeout: 120_000 },
    );
});
