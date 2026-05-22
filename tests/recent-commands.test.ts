import {
    loadRecentCommands,
    pushRecentCommand,
    RECENT_COMMANDS_KEY,
    RECENT_COMMANDS_LIMIT,
} from "@/components/shell/recent-commands";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

class MemoryStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
    removeItem(key: string): void {
        this.store.delete(key);
    }
    clear(): void {
        this.store.clear();
    }
}

let storage: MemoryStorage;

beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: Storage }).localStorage = storage as unknown as Storage;
});

afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("recent-commands", () => {
    test("loadRecentCommands returns empty array when storage is empty", () => {
        expect(loadRecentCommands()).toEqual([]);
    });

    test("pushRecentCommand persists the command id to localStorage", () => {
        pushRecentCommand("nav.dashboard");
        expect(storage.getItem(RECENT_COMMANDS_KEY)).toBe(JSON.stringify(["nav.dashboard"]));
        expect(loadRecentCommands()).toEqual(["nav.dashboard"]);
    });

    test("pushRecentCommand dedupes existing entries and moves them to the front", () => {
        pushRecentCommand("a");
        pushRecentCommand("b");
        pushRecentCommand("a");
        expect(loadRecentCommands()).toEqual(["a", "b"]);
    });

    test(`pushRecentCommand caps history at ${RECENT_COMMANDS_LIMIT}`, () => {
        for (let i = 0; i < RECENT_COMMANDS_LIMIT + 3; i += 1) {
            pushRecentCommand(`cmd-${i}`);
        }
        const recent = loadRecentCommands();
        expect(recent).toHaveLength(RECENT_COMMANDS_LIMIT);
        expect(recent[0]).toBe(`cmd-${RECENT_COMMANDS_LIMIT + 2}`);
    });

    test("loadRecentCommands returns empty array when stored JSON is malformed", () => {
        storage.setItem(RECENT_COMMANDS_KEY, "{not json");
        expect(loadRecentCommands()).toEqual([]);
    });

    test("loadRecentCommands returns empty array when stored value is not an array of strings", () => {
        storage.setItem(RECENT_COMMANDS_KEY, JSON.stringify({ foo: "bar" }));
        expect(loadRecentCommands()).toEqual([]);
    });
});
