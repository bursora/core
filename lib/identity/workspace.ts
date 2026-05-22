/**
 * Workspace aggregate.
 *
 * A workspace is the top-level tenant in Bursora. Every piece of usage data,
 * every budget, every API key belongs to exactly one workspace. Workspace IDs
 * are UUIDs minted at the database layer.
 */

export interface Workspace {
    readonly id: string;
    readonly name: string;
    readonly environment: string;
    readonly createdAt: Date;
}
