/**
 * Tests for the prune-events use case.
 *
 * Behaviors under test:
 *   1. Cloud workspaces: events older than 90d removed; newer rows kept
 *   2. Mixed workspaces: each gets the same 90d cutoff applied independently
 *   3. Whole monthly partition past retention + empty after deletes →
 *      partition dropped
 *   4. Partition with mixed expired+fresh rows → fall back to row-by-row;
 *      partition NOT dropped
 *   5. Run summary returns: rowsPruned, partitionsDropped, perWorkspace
 *
 * All tests use in-memory fakes — no DB, no time-of-day flakiness.
 */

import type { PartitionInfo, RetentionRepository, WorkspaceRetention } from "@/lib/metering";
import { pruneEvents } from "@/lib/metering";
import { describe, expect, test } from "bun:test";

// -- Fixtures ----------------------------------------------------------------

const NOW = new Date("2025-05-10T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

interface FakeEvent {
    workspaceId: string;
    ts: Date;
}

interface FakePartition extends PartitionInfo {
    rowCount: number;
}

interface FakeRepoState {
    workspaces: WorkspaceRetention[];
    events: FakeEvent[];
    partitions: FakePartition[];
}

interface RepoCalls {
    deletes: Array<{ workspaceId: string; cutoff: Date; rowsRemoved: number }>;
    partitionsDropped: string[];
}

const makeFakeRepo = (state: FakeRepoState): { repo: RetentionRepository; calls: RepoCalls } => {
    const calls: RepoCalls = { deletes: [], partitionsDropped: [] };

    const repo: RetentionRepository = {
        listWorkspaces: async () => state.workspaces,

        deleteEventsOlderThan: async (workspaceId, cutoff) => {
            const before = state.events.length;
            state.events = state.events.filter(
                (e) => !(e.workspaceId === workspaceId && e.ts < cutoff),
            );
            const removed = before - state.events.length;
            calls.deletes.push({ workspaceId, cutoff, rowsRemoved: removed });
            return removed;
        },

        listPartitionsOlderThan: async (cutoff) =>
            state.partitions.filter((p) => p.upperBound <= cutoff),

        countRowsInPartition: async (name) => {
            const part = state.partitions.find((p) => p.partitionName === name);
            if (!part) return 0;
            return part.rowCount;
        },

        dropPartition: async (name) => {
            calls.partitionsDropped.push(name);
            state.partitions = state.partitions.filter((p) => p.partitionName !== name);
        },
    };

    return { repo, calls };
};

// -- Tests --------------------------------------------------------------------

describe("pruneEvents", () => {
    test("cloud workspace: events older than 90d pruned, newer kept", async () => {
        const state: FakeRepoState = {
            workspaces: [{ workspaceId: "ws-cloud" }],
            events: [
                { workspaceId: "ws-cloud", ts: daysAgo(120) }, // expired
                { workspaceId: "ws-cloud", ts: daysAgo(91) }, // expired
                { workspaceId: "ws-cloud", ts: daysAgo(90) }, // boundary - kept (cutoff is strict <)
                { workspaceId: "ws-cloud", ts: daysAgo(5) }, // fresh
            ],
            partitions: [],
        };
        const { repo } = makeFakeRepo(state);

        const summary = await pruneEvents(repo, NOW);

        expect(state.events.length).toBe(2);
        expect(summary.rowsPruned).toBe(2);
        expect(summary.perWorkspace).toEqual([{ workspaceId: "ws-cloud", rowsPruned: 2 }]);
    });

    test("multiple workspaces: each gets the same 90d cutoff applied independently", async () => {
        const state: FakeRepoState = {
            workspaces: [{ workspaceId: "ws-a" }, { workspaceId: "ws-b" }],
            events: [
                { workspaceId: "ws-a", ts: daysAgo(120) }, // expired
                { workspaceId: "ws-a", ts: daysAgo(60) }, // fresh
                { workspaceId: "ws-b", ts: daysAgo(95) }, // expired
                { workspaceId: "ws-b", ts: daysAgo(10) }, // fresh
            ],
            partitions: [],
        };
        const { repo, calls } = makeFakeRepo(state);

        const summary = await pruneEvents(repo, NOW);

        expect(summary.rowsPruned).toBe(2);
        expect(state.events.length).toBe(2);
        expect(summary.perWorkspace).toEqual([
            { workspaceId: "ws-a", rowsPruned: 1 },
            { workspaceId: "ws-b", rowsPruned: 1 },
        ]);
        expect(calls.deletes.length).toBe(2);
        for (const c of calls.deletes) {
            expect(c.cutoff.getTime()).toBe(daysAgo(90).getTime());
        }
    });

    test("empty input: summary has zero counts and empty perWorkspace", async () => {
        const { repo } = makeFakeRepo({
            workspaces: [],
            events: [],
            partitions: [],
        });

        const summary = await pruneEvents(repo, NOW);

        expect(summary).toEqual({
            rowsPruned: 0,
            partitionsDropped: 0,
            perWorkspace: [],
        });
    });

    test("partition with rows remaining → NOT dropped (row-by-row only)", async () => {
        const partialPartition: FakePartition = {
            partitionName: "usage_events_2024_12",
            lowerBound: daysAgo(150),
            upperBound: daysAgo(100),
            rowCount: 3,
        };
        const state: FakeRepoState = {
            workspaces: [{ workspaceId: "ws-cloud" }],
            events: [],
            partitions: [partialPartition],
        };
        const { repo, calls } = makeFakeRepo(state);

        const summary = await pruneEvents(repo, NOW);

        expect(calls.partitionsDropped).toEqual([]);
        expect(summary.partitionsDropped).toBe(0);
        expect(state.partitions.length).toBe(1);
    });

    test("empty partition past retention → dropped (no row-by-row needed)", async () => {
        const oldPartition: FakePartition = {
            partitionName: "usage_events_2024_12",
            lowerBound: daysAgo(150),
            upperBound: daysAgo(100),
            rowCount: 0,
        };
        const state: FakeRepoState = {
            workspaces: [{ workspaceId: "ws-cloud" }],
            events: [
                { workspaceId: "ws-cloud", ts: daysAgo(10) }, // fresh, untouched
            ],
            partitions: [oldPartition],
        };
        const { repo, calls } = makeFakeRepo(state);

        const summary = await pruneEvents(repo, NOW);

        expect(calls.partitionsDropped).toEqual(["usage_events_2024_12"]);
        expect(summary.partitionsDropped).toBe(1);
        expect(summary.rowsPruned).toBe(0);
    });
});
