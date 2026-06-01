import {
    recordSetupError,
    type RecordSetupErrorInput,
    type SetupErrorLogger,
} from "@/lib/setup-errors/server";

/**
 * Test double for the fire-and-forget `SetupErrorLogger` seam. Routes call
 * `void setupErrorLogger().log(...)`, so tests can't await the background
 * promise directly. This logger delegates to a real recorder (default:
 * `recordSetupError`, which routes through whatever deps a test installed via
 * `setSetupErrorsDepsForTesting`) and tracks every in-flight promise. Await
 * {@link settled} instead of racing a real timer to drain the work
 * deterministically.
 */
export class TrackingSetupErrorLogger implements SetupErrorLogger {
    readonly calls: RecordSetupErrorInput[] = [];
    private readonly pending = new Set<Promise<void>>();
    private readonly delegate: SetupErrorLogger;

    constructor(delegate: SetupErrorLogger = { log: recordSetupError }) {
        this.delegate = delegate;
    }

    log(input: RecordSetupErrorInput): Promise<void> {
        this.calls.push(input);
        const p = this.delegate.log(input);
        this.pending.add(p);
        return p.finally(() => this.pending.delete(p));
    }

    /** Resolves once every logged promise (and any queued during the wait) has settled. */
    async settled(): Promise<void> {
        while (this.pending.size > 0) {
            await Promise.allSettled([...this.pending]);
        }
    }
}
