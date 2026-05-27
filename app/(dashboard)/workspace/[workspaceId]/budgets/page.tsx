import { PageHeader } from "@/components/shell/page-header";
import { MeteringActiveFilters } from "@/components/ui/workspace/filters/metering-active-filters";
import { MODES, type BudgetListFilter, type BudgetMode } from "@/lib/budgeting";
import { getBudgetStats, listBudgets } from "@/lib/budgeting/server";
import { listDistinctMeteringValuesBulk } from "@/lib/metering/server";
import { readParamList } from "@/lib/search-params";
import { BudgetCreateButton } from "./_components/budget-create-button";
import { BudgetsList } from "./_components/budgets-list";
import { createBudgetAction, deleteBudgetAction, updateBudgetAction } from "./actions";

interface BudgetsPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{
        tenant_id?: string;
        agent_id?: string;
        workflow_id?: string;
        mode?: string;
    }>;
}

export default async function BudgetsPage({ params, searchParams }: BudgetsPageProps) {
    const { workspaceId } = await params;
    const search = await searchParams;
    // Membership is guarded by the parent workspace layout.

    const tenantId = readParamList(search.tenant_id);
    const agentId = readParamList(search.agent_id);
    const workflowId = readParamList(search.workflow_id);
    const activeMode: BudgetMode | null = (MODES as readonly string[]).includes(search.mode ?? "")
        ? (search.mode as BudgetMode)
        : null;

    // A budget row has exactly one scope; the URL filter resolves to a single
    // discriminator. Priority: tenant > agent > workflow when multiple set.
    // Multi-select pills emit comma-joined values; the first one wins here.
    const filter: BudgetListFilter | undefined = resolveBudgetFilter({
        tenantId: tenantId[0],
        agentId: agentId[0],
        workflowId: workflowId[0],
    });

    const [budgets, optionsByScope] = await Promise.all([
        listBudgets(workspaceId, filter),
        listDistinctMeteringValuesBulk({
            workspaceId,
            scopes: ["tenant", "agent", "workflow"],
        }),
    ]);

    const statsByBudget = await getBudgetStats(workspaceId, budgets);

    const optValues = (scope: "tenant" | "agent" | "workflow") =>
        (optionsByScope[scope] ?? []).map((o) => o.value);

    const scopeSuggestions = {
        tenant: optValues("tenant"),
        agent: optValues("agent"),
        workflow: optValues("workflow"),
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Budgets"
                subtitle="Set spend limits per workspace, tenant, agent, or workflow. Block stops requests; throttle slows them; notify pages you."
                actions={
                    <BudgetCreateButton
                        workspaceId={workspaceId}
                        createAction={createBudgetAction}
                        scopeSuggestions={scopeSuggestions}
                    />
                }
            />

            <MeteringActiveFilters
                optionsByScope={optionsByScope}
                keys={["tenant_id", "agent_id", "workflow_id"]}
            />

            <BudgetsList
                workspaceId={workspaceId}
                budgets={budgets}
                statsByBudget={statsByBudget}
                activeMode={activeMode}
                updateAction={updateBudgetAction}
                deleteAction={deleteBudgetAction}
                scopeSuggestions={scopeSuggestions}
            />
        </div>
    );
}

function resolveBudgetFilter(ids: {
    tenantId: string | undefined;
    agentId: string | undefined;
    workflowId: string | undefined;
}): BudgetListFilter | undefined {
    if (ids.tenantId !== undefined) return { kind: "tenant", id: ids.tenantId };
    if (ids.agentId !== undefined) return { kind: "agent", id: ids.agentId };
    if (ids.workflowId !== undefined) return { kind: "workflow", id: ids.workflowId };
    return undefined;
}
