import { generateApiKeyPlaintext, hashApiKey, parseApiKeyPlaintext } from "@/lib/identity";
import { describe, expect, test } from "bun:test";

describe("hashApiKey", () => {
    test("is deterministic for the same plaintext + pepper", () => {
        const a = hashApiKey("bsk_w_abc", "pepper");
        const b = hashApiKey("bsk_w_abc", "pepper");
        expect(a).toBe(b);
    });

    test("differs when the pepper changes", () => {
        const a = hashApiKey("bsk_w_abc", "pepper-1");
        const b = hashApiKey("bsk_w_abc", "pepper-2");
        expect(a).not.toBe(b);
    });

    test("rejects empty pepper", () => {
        expect(() => hashApiKey("bsk_w_abc", "")).toThrow();
    });
});

describe("generateApiKeyPlaintext", () => {
    test("produces the bsk_<workspace>_<random32> shape", () => {
        const wid = "11111111-2222-3333-4444-555555555555";
        const k = generateApiKeyPlaintext(wid);
        expect(k.startsWith(`bsk_${wid}_`)).toBe(true);
        const random = k.slice(`bsk_${wid}_`.length);
        expect(random).toHaveLength(32);
        expect(/^[0-9a-f]+$/.test(random)).toBe(true);
    });
});

describe("parseApiKeyPlaintext", () => {
    test("extracts workspaceId and secret", () => {
        const wid = "11111111-2222-3333-4444-555555555555";
        const k = `bsk_${wid}_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
        const parsed = parseApiKeyPlaintext(k);
        expect(parsed?.workspaceId).toBe(wid);
        expect(parsed?.secret).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    });

    test("returns null on missing prefix", () => {
        expect(parseApiKeyPlaintext("xyz_w_abc")).toBeNull();
    });

    test("returns null on missing random segment", () => {
        expect(parseApiKeyPlaintext("bsk_workspace_")).toBeNull();
    });

    test("returns null on wrong-length random segment", () => {
        expect(parseApiKeyPlaintext("bsk_w_abc")).toBeNull();
    });
});
