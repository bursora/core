/**
 * Substituted for the api-key sentinel when the caller can't supply the real
 * `bsk_` plaintext (the key was issued in an earlier session, so the flash
 * cookie has expired). A visibly fake value the user must swap for their own
 * key — never the api-key row id, which is not a credential and 401s the SDK.
 */
export const BURSORA_API_KEY_PLACEHOLDER = "YOUR_BURSORA_API_KEY";
