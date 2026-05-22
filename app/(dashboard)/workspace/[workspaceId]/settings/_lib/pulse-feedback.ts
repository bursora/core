/**
 * Border-pulse feedback helpers for the alert channels save flow.
 *
 * On submit, the form border briefly pulses success or destructive. When
 * the user prefers reduced motion, the pulse is skipped entirely; the
 * caller still emits a toast. The duration is short enough to read but
 * not block input.
 */

export type PulseState = "idle" | "success" | "error";

export const PULSE_DURATION_MS = 1200;

export function pulseClass(state: PulseState): string {
    switch (state) {
        case "idle":
            return "";
        case "success":
            return "border-success";
        case "error":
            return "border-destructive";
    }
}

export function shouldPulse(prefersReducedMotion: boolean): boolean {
    return !prefersReducedMotion;
}
