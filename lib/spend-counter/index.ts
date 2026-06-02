/**
 * Public API of the spend-counter module.
 *
 * The metering ingest path wires `createSpendCounter` to fire increments after a
 * ClickHouse insert; the budget check (slice #146) calls `read`. The Redis
 * adapter is the production store; tests inject an in-memory fake of
 * `SpendCounterStore`.
 */

export { RedisSpendCounterStore } from "./redis-store";
export {
    createSpendCounter,
    type ReadSpendQuery,
    type RecordSpendEvent,
    type SpendCounter,
    type SpendCounterDeps,
} from "./spend-counter";
export type { SpendCounterStore, SpendIncrement } from "./store";
