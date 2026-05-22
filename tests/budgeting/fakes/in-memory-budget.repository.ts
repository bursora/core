import type {
    BudgetListFilter,
    BudgetRepository,
    BudgetScopeQuery,
    CreateBudgetInput,
    RawBudget,
    UpdateBudgetInput,
} from "@/lib/budgeting";
import { randomUUID } from "node:crypto";

export class InMemoryBudgetRepository implements BudgetRepository {
    readonly rows = new Map<string, RawBudget>();

    async findApplicable(_query: BudgetScopeQuery): Promise<readonly RawBudget[]> {
        return [...this.rows.values()];
    }

    async listByWorkspace(
        workspaceId: string,
        filter?: BudgetListFilter,
    ): Promise<readonly RawBudget[]> {
        return [...this.rows.values()].filter((r) => {
            if (r.workspaceId !== workspaceId) return false;
            if (filter === undefined) return true;
            return r.scopeType === filter.kind && r.scopeId === filter.id;
        });
    }

    async findById(id: string, workspaceId: string): Promise<RawBudget | null> {
        const row = this.rows.get(id);
        return row && row.workspaceId === workspaceId ? row : null;
    }

    async create(input: CreateBudgetInput): Promise<RawBudget> {
        const row: RawBudget = {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            period: input.period,
            amountUsd: input.amountUsd,
            mode: input.mode,
        };
        this.rows.set(row.id, row);
        return row;
    }

    async update(
        id: string,
        workspaceId: string,
        patch: UpdateBudgetInput,
    ): Promise<RawBudget | null> {
        const existing = this.rows.get(id);
        if (!existing || existing.workspaceId !== workspaceId) return null;
        const next: RawBudget = {
            ...existing,
            ...(patch.scopeType !== undefined ? { scopeType: patch.scopeType } : {}),
            ...(patch.scopeId !== undefined ? { scopeId: patch.scopeId } : {}),
            ...(patch.period !== undefined ? { period: patch.period } : {}),
            ...(patch.amountUsd !== undefined ? { amountUsd: patch.amountUsd } : {}),
            ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
        };
        this.rows.set(id, next);
        return next;
    }

    async delete(id: string, workspaceId: string): Promise<boolean> {
        const existing = this.rows.get(id);
        if (!existing || existing.workspaceId !== workspaceId) return false;
        this.rows.delete(id);
        return true;
    }
}
