import { decryptApiKey, encryptApiKey, parseEncryptionKey } from "@/lib/identity/api-key.cipher";
import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

const KEY_B64 = randomBytes(32).toString("base64");

describe("parseEncryptionKey", () => {
    test("accepts a 32-byte base64 key", () => {
        const key = parseEncryptionKey(KEY_B64);
        expect(key).toBeInstanceOf(Buffer);
        expect(key).toHaveLength(32);
    });

    test("rejects a key that decodes to the wrong length", () => {
        expect(() => parseEncryptionKey(randomBytes(16).toString("base64"))).toThrow();
    });

    test("rejects an empty key", () => {
        expect(() => parseEncryptionKey("")).toThrow();
    });
});

describe("encryptApiKey / decryptApiKey", () => {
    const key = parseEncryptionKey(KEY_B64);
    const plaintext = "bsk_11111111-2222-3333-4444-555555555555_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    test("round-trips plaintext through encrypt then decrypt", () => {
        const sealed = encryptApiKey(plaintext, key);
        expect(decryptApiKey(sealed, key)).toBe(plaintext);
    });

    test("ciphertext is not the plaintext", () => {
        const sealed = encryptApiKey(plaintext, key);
        expect(sealed.cipherText).not.toContain(plaintext);
    });

    test("each encryption uses a fresh iv", () => {
        const a = encryptApiKey(plaintext, key);
        const b = encryptApiKey(plaintext, key);
        expect(a.iv).not.toBe(b.iv);
        expect(a.cipherText).not.toBe(b.cipherText);
    });

    test("rejects a tampered ciphertext (auth-tag failure)", () => {
        const sealed = encryptApiKey(plaintext, key);
        const tamperedBytes = Buffer.from(sealed.cipherText, "base64");
        tamperedBytes[0] = tamperedBytes[0]! ^ 0xff;
        const tampered = { ...sealed, cipherText: tamperedBytes.toString("base64") };
        expect(() => decryptApiKey(tampered, key)).toThrow();
    });

    test("rejects a tampered auth tag", () => {
        const sealed = encryptApiKey(plaintext, key);
        const tagBytes = Buffer.from(sealed.authTag, "base64");
        tagBytes[0] = tagBytes[0]! ^ 0xff;
        const tampered = { ...sealed, authTag: tagBytes.toString("base64") };
        expect(() => decryptApiKey(tampered, key)).toThrow();
    });

    test("rejects decryption under the wrong key", () => {
        const sealed = encryptApiKey(plaintext, key);
        const otherKey = parseEncryptionKey(randomBytes(32).toString("base64"));
        expect(() => decryptApiKey(sealed, otherKey)).toThrow();
    });
});
