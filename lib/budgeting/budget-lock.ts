/**
 * BudgetLock port — pessimistic serialization for block-mode budget decisions.
 *
 * `withBlockBudgetLocks` runs `fn` under a per-budget lock for every id in
 * `blockBudgetIds`. When the id list is empty the call is a no-op pass-through.
 * Block-mode budgets serialize concurrent decisions via this row lock to
 * prevent overshoot at the cap. Notify and throttle budgets bypass the lock
 * entirely so high-throughput alert workloads stay unaffected.
 *
 * Implementations must acquire locks in deterministic order so concurrent
 * callers on overlapping id sets never deadlock; sort by id is enough.
 *
 * Failure to acquire (e.g. lock contention timeout) must surface as a thrown
 * error — the use case has no recovery path that's safer than rejecting the
 * decision.
 */

export interface BudgetLock {
    withBlockBudgetLocks<T>(
        workspaceId: string,
        blockBudgetIds: readonly string[],
        fn: () => Promise<T>,
    ): Promise<T>;
}
