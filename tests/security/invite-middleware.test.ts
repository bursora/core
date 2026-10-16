import { config, middleware } from "@/middleware";
import { expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { runIsolatedTest } from "../support/run-isolated-test";

// Next's test helpers load server runtime globals; keep them out of other suites.
if (process.env.BURSORA_ISOLATED_TEST !== import.meta.path) {
    test("invite middleware boundary", () => runIsolatedTest(import.meta.path));
} else {
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    const token = "a1".repeat(24);

    test.each([
        "/invite",
        "/invite/test",
        "/invite/[token]",
        "/invite/tok",
        "/invite/%E0%A4",
        `/invite/${token}/extra`,
        `/invite/${"g".repeat(48)}`,
    ])("rejects malformed invite URL before parsing a scanner body: %s", (path) => {
        expect(
            unstable_doesMiddlewareMatch({ config, url: `https://app.bursora.com${path}` }),
        ).toBe(true);
        const request = new NextRequest(`https://app.bursora.com${path}`, {
            method: "POST",
            headers: {
                "content-type": "multipart/form-data; boundary=----WebKitFormBoundarySSRF64649",
                "next-action": "60c6e58afa30af5c6d0d7de811c4ba3223c3e3d412",
                origin: "https://evil.example",
            },
            body: "truncated multipart body",
        });
        const response = middleware(request);
        expect(response.status).toBe(404);
        expect(response.headers.get("x-middleware-next")).toBeNull();
        expect(request.bodyUsed).toBe(false);
        expect(middleware(new NextRequest(`https://app.bursora.com${path}`)).status).toBe(404);
    });

    test.each([
        `/invite/${token}`,
        `/invite/${token}?next=keys`,
        `/invite/${token.replace("a", "%61")}`,
    ])("valid invite URLs retain page rendering and form submissions: %s", (path) => {
        for (const method of ["GET", "POST"]) {
            const response = middleware(
                new NextRequest(`https://app.bursora.com${path}`, { method }),
            );
            expect(response.headers.get("x-middleware-next")).toBe("1");
            expect(response.headers.get("content-security-policy")).toBeNull();
        }
    });

    test("matcher leaves dashboard, login and static assets alone", () => {
        for (const path of ["/login", "/workspace", "/_next/static/app.js"]) {
            expect(
                unstable_doesMiddlewareMatch({ config, url: `https://app.bursora.com${path}` }),
            ).toBe(false);
        }
    });
}
