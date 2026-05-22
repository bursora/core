/**
 * In-process event bus implementation.
 *
 * Backed by Node's EventEmitter. Synchronous publication: handlers run in
 * order, and the publisher awaits each one. A handler that throws is
 * caught and logged; the publisher never sees the failure. Subsequent
 * handlers still execute.
 *
 * Bound at app boot from `lib/notification/bootstrap.ts`. Tests inject
 * their own implementation via `lib/detection/server.ts`.
 */

import { EventEmitter } from "node:events";
import { errMessage } from "./error-message";
import type { EventBus } from "./event-bus";

export class InMemoryEventBus implements EventBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        // EventEmitter caps listener count at 10 by default and emits
        // a noisy warning above that. The notification bootstrap registers
        // exactly one handler per topic, so 10 is plenty, but be explicit.
        this.emitter.setMaxListeners(50);
    }

    async publish<E>(topic: string, event: E): Promise<void> {
        const handlers = this.emitter.listeners(topic) as Array<(event: E) => Promise<void> | void>;
        for (const handler of handlers) {
            try {
                await handler(event);
            } catch (err) {
                console.warn("event_bus.handler_failed", {
                    topic,
                    error: errMessage(err),
                });
            }
        }
    }

    subscribe<E>(topic: string, handler: (event: E) => Promise<void> | void): void {
        this.emitter.on(topic, handler as (...args: unknown[]) => void);
    }
}

let cached: InMemoryEventBus | null = null;

export function eventBus(): InMemoryEventBus {
    if (cached === null) cached = new InMemoryEventBus();
    return cached;
}
