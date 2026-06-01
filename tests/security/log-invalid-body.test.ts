/**
 * Locks the invalid-body log shape. `logInvalidBody` emits one structured
 * `console.warn` carrying route + workspace/key correlation and each Zod issue
 * mapped to {path, code, message}. The raw `input` Zod attaches to issues is
 * customer payload and must never reach the log. console is an owned process
 * boundary, so we spy on it.
 */

import { logInvalidBody } from "@/lib/log-invalid-body";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";

const issuesFor = (input: unknown): readonly z.core.$ZodIssue[] => {
    const result = z.object({ count: z.number(), label: z.string() }).safeParse(input);
    if (result.success) throw new Error("expected parse to fail");
    return result.error.issues;
};

const lastWarn = (warn: ReturnType<typeof spyOn>): readonly unknown[] =>
    warn.mock.calls[warn.mock.calls.length - 1] as readonly unknown[];

describe("logInvalidBody", () => {
    let warn: ReturnType<typeof spyOn>;

    afterEach(() => warn.mockRestore());

    test("warns once with route, correlation ids, and mapped issues", () => {
        warn = spyOn(console, "warn").mockImplementation(() => {});
        const issues = issuesFor({ count: "x", label: 5 });

        logInvalidBody({
            route: "v1.events",
            workspaceId: "ws_1",
            apiKeyId: "key_1",
            issues,
        });

        expect(warn).toHaveBeenCalledTimes(1);
        const [tag, payload] = lastWarn(warn) as [string, Record<string, unknown>];
        expect(tag).toBe("v1.invalid_body");
        expect(payload.route).toBe("v1.events");
        expect(payload.workspaceId).toBe("ws_1");
        expect(payload.apiKeyId).toBe("key_1");

        const logged = payload.issues as ReadonlyArray<Record<string, unknown>>;
        expect(logged).toHaveLength(2);
        for (const entry of logged) {
            expect(Object.keys(entry).sort()).toEqual(["code", "message", "path"]);
            expect(typeof entry.path).toBe("string");
            expect(typeof entry.code).toBe("string");
            expect(typeof entry.message).toBe("string");
        }
        expect(logged.map((e) => e.path)).toEqual(["count", "label"]);
    });

    test("never includes the raw Zod input (no payload leak)", () => {
        warn = spyOn(console, "warn").mockImplementation(() => {});
        const secret = "super-secret-payload";
        // $ZodIssue carries an optional `input` (the offending value). Attach
        // the secret there to prove the mapping drops it.
        const issues: readonly z.core.$ZodIssue[] = [
            {
                code: "custom",
                path: ["password"],
                message: "too weak",
                input: secret,
            },
        ];

        logInvalidBody({
            route: "v1.events",
            workspaceId: "ws_1",
            apiKeyId: "key_1",
            issues,
        });

        const [, payload] = lastWarn(warn) as [string, Record<string, unknown>];
        const logged = payload.issues as ReadonlyArray<Record<string, unknown>>;
        expect(logged).toEqual([{ path: "password", code: "custom", message: "too weak" }]);
        expect(JSON.stringify(lastWarn(warn))).not.toContain(secret);
    });
});
