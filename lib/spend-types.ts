export type Facet = "tenant" | "agent" | "workflow" | "model";

export const FACETS: readonly Facet[] = ["tenant", "agent", "workflow", "model"];

export const FACET_LABEL: Record<Facet, string> = {
    tenant: "By tenant",
    agent: "By agent",
    workflow: "By workflow",
    model: "By model",
};
