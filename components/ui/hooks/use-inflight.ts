import { useCallback, useRef } from "react";

/**
 * Wraps an async handler so re-entrant calls are dropped while one is still
 * running. Closes the double-submit window a disabled-button guard leaves
 * open: a fast double-click that lands before the disabled state repaints, or
 * two triggers racing on the same handler (e.g. OTP paste-to-autosubmit firing
 * alongside an Enter keypress). The ref flips synchronously on entry, so the
 * second call is rejected even within the same tick.
 */
export function useInflight<Args extends readonly unknown[]>(
    handler: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
    const running = useRef(false);
    return useCallback(
        async (...args: Args) => {
            if (running.current) return;
            running.current = true;
            try {
                await handler(...args);
            } finally {
                running.current = false;
            }
        },
        [handler],
    );
}
