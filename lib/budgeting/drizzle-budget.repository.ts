/**
 * Drizzle implementation of the BudgetRepository.
 *
 * `findApplicable` returns every budget row for the workspace where:
 *   - scope_type = 'workspace' (always applies; scope_id is NULL), OR
 *   - scope_type matches one of the requested scopes AND scope_id matches.
 *
 * Period column stores the literal `daily`/`weekly`/`monthly` strings the
 * domain uses. Rows with anything else are filtered out so the domain never
 * sees a value it can't classify.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import type { BudgetMode, ScopeType } from "./budget";
import type {
    BudgetListFilter,
    BudgetRepository,
    BudgetScopeQuery,
    CreateBudgetInput,
    RawBudget,
    UpdateBudgetInput,
} from "./budget.repository";
import type { Period } from "./period";

export class DrizzleBudgetRepository implements BudgetRepository {
    constructor(private readonly db: Db) {}

    async findApplicable(query: BudgetScopeQuery): Promise<readonly RawBudget[]> {
        const scopeFilters: SQL[] = [
            and(eq(schema.budgets.scopeType, "workspace"), isNull(schema.budgets.scopeId)) as SQL,
        ];
        if (query.tenantId !== null) {
            scopeFilters.push(
                and(
                    eq(schema.budgets.scopeType, "tenant"),
                    eq(schema.budgets.scopeId, query.tenantId),
                ) as SQL,
            );
        }
        if (query.agentId !== null) {
            scopeFilters.push(
                and(
                    eq(schema.budgets.scopeType, "agent"),
                    eq(schema.budgets.scopeId, query.agentId),
                ) as SQL,
            );
        }
        if (query.workflowId !== null) {
            scopeFilters.push(
                and(
                    eq(schema.budgets.scopeType, "workflow"),
                    eq(schema.budgets.scopeId, query.workflowId),
                ) as SQL,
            );
        }

        const rows = await this.db
            .select()
            .from(schema.budgets)
            .where(and(eq(schema.budgets.workspaceId, query.workspaceId), or(...scopeFilters)));

        const out: RawBudget[] = [];
        for (const row of rows) {
            const mapped = toRawBudget(row);
            if (mapped !== null) out.push(mapped);
        }
        return out;
    }

    async listByWorkspace(
        workspaceId: string,
        filter?: BudgetListFilter,
    ): Promise<readonly RawBudget[]> {
        const conds: SQL[] = [eq(schema.budgets.workspaceId, workspaceId) as SQL];
        if (filter !== undefined) {
            conds.push(eq(schema.budgets.scopeType, filter.kind) as SQL);
            conds.push(eq(schema.budgets.scopeId, filter.id) as SQL);
        }

        const rows = await this.db
            .select()
            .from(schema.budgets)
            .where(and(...conds))
            .orderBy(desc(schema.budgets.createdAt));
        const out: RawBudget[] = [];
        for (const row of rows) {
            const mapped = toRawBudget(row);
            if (mapped !== null) out.push(mapped);
        }
        return out;
    }

    async findById(id: string, workspaceId: string): Promise<RawBudget | null> {
        const [row] = await this.db
            .select()
            .from(schema.budgets)
            .where(and(eq(schema.budgets.id, id), eq(schema.budgets.workspaceId, workspaceId)))
            .limit(1);
        return row ? toRawBudget(row) : null;
    }

    async create(input: CreateBudgetInput): Promise<RawBudget> {
        const [row] = await this.db
            .insert(schema.budgets)
            .values({
                workspaceId: input.workspaceId,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
                period: input.period,
                amountUsd: input.amountUsd,
                mode: input.mode,
            })
            .returning();
        if (!row) throw new Error("budget insert returned no row");
        const mapped = toRawBudget(row);
        if (mapped === null) throw new Error("budget insert produced unmappable row");
        return mapped;
    }

    async update(
        id: string,
        workspaceId: string,
        patch: UpdateBudgetInput,
    ): Promise<RawBudget | null> {
        const setClause: Record<string, unknown> = {};
        if (patch.scopeType !== undefined) setClause.scopeType = patch.scopeType;
        if (patch.scopeId !== undefined) setClause.scopeId = patch.scopeId;
        if (patch.period !== undefined) setClause.period = patch.period;
        if (patch.amountUsd !== undefined) setClause.amountUsd = patch.amountUsd;
        if (patch.mode !== undefined) setClause.mode = patch.mode;

        if (Object.keys(setClause).length === 0) {
            const [row] = await this.db
                .select()
                .from(schema.budgets)
                .where(and(eq(schema.budgets.id, id), eq(schema.budgets.workspaceId, workspaceId)))
                .limit(1);
            return row ? toRawBudget(row) : null;
        }

        const [row] = await this.db
            .update(schema.budgets)
            .set(setClause)
            .where(and(eq(schema.budgets.id, id), eq(schema.budgets.workspaceId, workspaceId)))
            .returning();
        return row ? toRawBudget(row) : null;
    }

    async delete(id: string, workspaceId: string): Promise<boolean> {
        const result = await this.db
            .delete(schema.budgets)
            .where(and(eq(schema.budgets.id, id), eq(schema.budgets.workspaceId, workspaceId)))
            .returning({ id: schema.budgets.id });
        return result.length > 0;
    }
}

type Row = typeof schema.budgets.$inferSelect;

function toRawBudget(row: Row): RawBudget | null {
    const period = mapPeriod(row.period);
    const scopeType = mapScopeType(row.scopeType);
    const mode = mapMode(row.mode);
    if (period === null || scopeType === null || mode === null) return null;
    return {
        id: row.id,
        workspaceId: row.workspaceId,
        scopeType,
        scopeId: row.scopeId,
        period,
        amountUsd: row.amountUsd,
        mode,
    };
}

function mapPeriod(value: string): Period | null {
    if (value === "daily" || value === "weekly" || value === "monthly") {
        return value;
    }
    return null;
}

function mapScopeType(value: string): ScopeType | null {
    if (value === "workspace" || value === "tenant" || value === "agent" || value === "workflow") {
        return value;
    }
    return null;
}

function mapMode(value: string): BudgetMode | null {
    if (value === "notify" || value === "throttle" || value === "block") {
        return value;
    }
    return null;
}
