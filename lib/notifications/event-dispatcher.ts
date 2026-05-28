/**
 * In-process EventDispatcher seam.
 *
 * Explicit alternative to the topic-string match on the legacy event bus:
 * handlers register against a topic via `on`, callers fire events via
 * `dispatch`. The event carries its own `topic`, so the call site never has
 * to repeat the string. Handlers for a topic run in parallel; one handler
 * that throws is logged and isolated, the dispatch promise still resolves.
 */

import { errMessage } from "../error-message";

export type EventHandler<T> = (event: T) => Promise<void>;

export interface EventDispatcher {
    on<T>(topic: string, handler: EventHandler<T>): void;
    dispatch<T extends { topic: string }>(event: T): Promise<void>;
}

export function createEventDispatcher(): EventDispatcher {
    const handlers = new Map<string, EventHandler<unknown>[]>();

    return {
        on<T>(topic: string, handler: EventHandler<T>): void {
            const bucket = handlers.get(topic) ?? [];
            bucket.push(handler as EventHandler<unknown>);
            handlers.set(topic, bucket);
        },

        async dispatch<T extends { topic: string }>(event: T): Promise<void> {
            const bucket = handlers.get(event.topic);
            if (bucket === undefined || bucket.length === 0) return;
            const results = await Promise.allSettled(bucket.map((h) => h(event)));
            for (const result of results) {
                if (result.status === "rejected") {
                    console.warn("event_dispatcher.handler_failed", {
                        topic: event.topic,
                        error: errMessage(result.reason),
                    });
                }
            }
        },
    };
}
