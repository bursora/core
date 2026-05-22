export interface RawCompositionRow {
    readonly tenantId: string;
    readonly model: string;
    readonly costUsd: number;
}

export interface ModelShare {
    readonly model: string;
    readonly costUsd: number;
    readonly share: number;
}

export interface CustomerComposition {
    readonly tenantId: string;
    readonly totalCostUsd: number;
    readonly models: readonly ModelShare[];
}

export function composeSpend(
    rows: readonly RawCompositionRow[],
    topN: number,
): readonly CustomerComposition[] {
    const byTenant = new Map<string, Map<string, number>>();
    for (const row of rows) {
        if (row.costUsd <= 0) continue;
        let models = byTenant.get(row.tenantId);
        if (!models) {
            models = new Map<string, number>();
            byTenant.set(row.tenantId, models);
        }
        models.set(row.model, (models.get(row.model) ?? 0) + row.costUsd);
    }

    const customers: CustomerComposition[] = [];
    for (const [tenantId, models] of byTenant) {
        const total = [...models.values()].reduce((s, v) => s + v, 0);
        if (total <= 0) continue;
        const sortedModels: ModelShare[] = [...models.entries()]
            .map(([model, costUsd]) => ({ model, costUsd, share: costUsd / total }))
            .sort((a, b) => b.costUsd - a.costUsd);
        customers.push({ tenantId, totalCostUsd: total, models: sortedModels });
    }

    return customers.sort((a, b) => b.totalCostUsd - a.totalCostUsd).slice(0, topN);
}
