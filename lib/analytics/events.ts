/**
 * Funnel event vocabulary. One named event per activation/conversion step,
 * fired at its real hook point. Shared by the server capture helper and the
 * client provider so both sides spell the names the same way.
 *
 * Privacy rule: event properties never carry PII. No email, no raw user id.
 * Ids are opaque (hashed) or omitted. See `lib/analytics/server-capture.ts`.
 */

export type FunnelEvent =
    | "signup"
    | "subscribe_started"
    | "subscribed"
    | "workspace_created"
    | "api_key_issued"
    | "first_event_received"
    | "budget_created"
    | "paywall_viewed";
