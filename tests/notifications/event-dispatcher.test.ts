/**
 * Tests for the in-process EventDispatcher seam.
 *
 * Replaces the implicit topic-string match on the event bus with an explicit
 * dispatcher: handlers register against a topic via `on`, callers fire events
 * via `dispatch`. Failure isolation: one handler throwing does not poison
 * other handlers, and the dispatch promise still resolves.
 */

import { createEventDispatcher } from "@/lib/notifications/event-dispatcher";
import { describe, expect, test } from "bun:test";

describe("createEventDispatcher", () => {
    test("fans an event out to every handler registered for its topic, and a thrown handler does not poison the others", async () => {
        const dispatcher = createEventDispatcher();
        const calls: string[] = [];

        dispatcher.on<{ topic: string; payload: string }>("budget_alert", async (event) => {
            calls.push(`first:${event.payload}`);
        });
        dispatcher.on<{ topic: string; payload: string }>("budget_alert", async () => {
            throw new Error("boom");
        });
        dispatcher.on<{ topic: string; payload: string }>("budget_alert", async (event) => {
            calls.push(`third:${event.payload}`);
        });

        await dispatcher.dispatch({ topic: "budget_alert", payload: "hello" });

        expect(calls).toContain("first:hello");
        expect(calls).toContain("third:hello");
        expect(calls).toHaveLength(2);
    });

    test("only handlers whose topic matches the event are invoked", async () => {
        const dispatcher = createEventDispatcher();
        const calls: string[] = [];

        dispatcher.on<{ topic: string }>("budget_alert", async () => {
            calls.push("budget");
        });
        dispatcher.on<{ topic: string }>("anomaly_alert", async () => {
            calls.push("anomaly");
        });

        await dispatcher.dispatch({ topic: "anomaly_alert" });

        expect(calls).toEqual(["anomaly"]);
    });

    test("dispatching a topic with no registered handlers resolves cleanly", async () => {
        const dispatcher = createEventDispatcher();
        await expect(dispatcher.dispatch({ topic: "no_one_home" })).resolves.toBeUndefined();
    });
});
