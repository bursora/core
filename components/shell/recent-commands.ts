/**
 * Tracks the user's last few command-palette picks. Persisted to localStorage
 * so the "Recent" group survives reloads. Pure read/write helpers — the
 * palette wires them up; everything here works in any environment that
 * exposes a `localStorage`-shaped global (browsers and the test harness).
 */

export const RECENT_COMMANDS_KEY = "bursora_recent_commands";
export const RECENT_COMMANDS_LIMIT = 5;
const CHANGE_EVENT = "bursora:recent-commands-change";

function getStorage(): Storage | null {
    if (typeof globalThis === "undefined") return null;
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
}

// `useSyncExternalStore` requires loadRecentCommands to return a stable
// reference when the underlying data is unchanged; otherwise React loops. We
// cache the last result and invalidate it via `pushRecentCommand`.
let cachedRaw: string | null = null;
let cachedSnapshot: ReadonlyArray<string> = [];

export function loadRecentCommands(): ReadonlyArray<string> {
    const storage = getStorage();
    if (!storage) return cachedSnapshot;
    const raw = storage.getItem(RECENT_COMMANDS_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    if (!raw) {
        cachedSnapshot = [];
        return cachedSnapshot;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            cachedSnapshot = [];
            return cachedSnapshot;
        }
        if (!parsed.every((item): item is string => typeof item === "string")) {
            cachedSnapshot = [];
            return cachedSnapshot;
        }
        cachedSnapshot = parsed.slice(0, RECENT_COMMANDS_LIMIT);
        return cachedSnapshot;
    } catch {
        cachedSnapshot = [];
        return cachedSnapshot;
    }
}

export function pushRecentCommand(id: string): ReadonlyArray<string> {
    const storage = getStorage();
    const current = loadRecentCommands();
    const next = [id, ...current.filter((entry) => entry !== id)].slice(0, RECENT_COMMANDS_LIMIT);
    if (storage) {
        storage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    return next;
}

export function subscribeRecentCommands(callback: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, callback);
    return () => window.removeEventListener(CHANGE_EVENT, callback);
}
