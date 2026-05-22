import { createHash } from "node:crypto";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Deterministic UUID from a natural key. Same input → same output, every time.
 *
 * Uses SHA-1 over the input (matches RFC 4122 v5's hash) and shapes the digest
 * into the UUID v5 layout: version nibble = 5, variant bits = 10xx. The
 * namespace is a fixed constant baked into the input string so callers don't
 * have to plumb one through.
 *
 * Used when a row's identity is fully determined by its content (e.g. an
 * anomaly alert keyed by workspace + scope + bucket). Lets the producer mint
 * the id up front and the DB dedup via `ON CONFLICT (id) DO NOTHING`, so the
 * id in the bus event always equals the id of the persisted row.
 */
export function deterministicUuid(key: string): string {
    const hash = createHash("sha1").update(`bursora:v5:${key}`).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    // Set version 5 (0101xxxx) and variant (10xxxxxx). The `?? 0` is a no-op
    // at runtime (subarray(0, 16) guarantees 16 bytes) but satisfies
    // noUncheckedIndexedAccess.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
