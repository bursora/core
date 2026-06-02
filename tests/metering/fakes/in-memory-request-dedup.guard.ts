import type { RequestDedupGuard } from "@/lib/metering";

/**
 * In-memory `RequestDedupGuard` for tests. Tracks seen keys in a Set that
 * persists across calls on the same instance, mirroring the Redis adapter's
 * within-window behavior: a key returns as fresh exactly once, including
 * within a single batch.
 */
export class InMemoryRequestDedupGuard implements RequestDedupGuard {
    private readonly seen = new Set<string>();

    async keepUnseen(keys: readonly string[]): Promise<ReadonlySet<string>> {
        const fresh = new Set<string>();
        for (const key of keys) {
            if (this.seen.has(key)) continue;
            this.seen.add(key);
            fresh.add(key);
        }
        return fresh;
    }
}
