/**
 * Flash cookie used to ferry a freshly issued API key plaintext from the
 * server action to the next page render. Plaintext must never be passed via
 * the URL (browser history, access logs, Referer leaks).
 *
 * The cookie cannot be cleared from a Server Component (Next.js forbids
 * `cookies().set` outside Server Actions and Route Handlers), so this reader
 * does not delete. The IssuedKeyCard's "I've saved it" button calls
 * `dismissIssuedKeyAction` to clear it; otherwise it expires via TTL.
 */

import { cookies } from "next/headers";

export const ISSUED_KEY_COOKIE = "bursora_issued_key";
export const ISSUED_KEY_COOKIE_MAX_AGE = 60 * 5;

export async function readIssuedKey(): Promise<string | null> {
    const jar = await cookies();
    return jar.get(ISSUED_KEY_COOKIE)?.value ?? null;
}
