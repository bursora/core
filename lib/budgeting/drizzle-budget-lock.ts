/**
 * Drizzle BudgetLock — pessimistic row lock on the `budgets` table.
 *
 * Block-mode budgets serialize concurrent decisions via row lock to prevent
 * overshoot at the cap. Notify/throttle budgets skip the lock; this impl is
 * only consulted by the use case for the block-mode subset.
 *
 * Locks are acquired by id-sorted order inside a single transaction via
 * `SELECT ... FROM budgets WHERE id IN (...) AND workspace_id = ... FOR
 * UPDATE`. Sorting prevents deadlock between concurrent callers that hold
 * overlapping budget sets. The transaction commits on `fn()` resolve and
 * rolls back on throw, releasing every lock atomically.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import type { BudgetLock } from "./budget-lock";

export function drizzleBudgetLock(db: Db): BudgetLock {
    return {
        async withBlockBudgetLocks<T>(
            workspaceId: string,
            blockBudgetIds: readonly string[],
            fn: () => Promise<T>,
        ): Promise<T> {
            if (blockBudgetIds.length === 0) return fn();
            const sorted = [...blockBudgetIds].sort();
            return db.transaction(async (tx) => {
                // Acquire row locks in deterministic order. Postgres respects
                // the IN clause but `ORDER BY id` makes the lock acquisition
                // order explicit and matches the sort above.
                await tx
                    .select({ id: schema.budgets.id })
                    .from(schema.budgets)
                    .where(
                        and(
                            eq(schema.budgets.workspaceId, workspaceId),
                            inArray(schema.budgets.id, sorted),
                        ),
                    )
                    .orderBy(schema.budgets.id)
                    .for("update");
                return fn();
            });
        },
    };
}
