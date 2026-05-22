import type { MeteringFilters, MeteringStatusFilter } from "./metering/metering-read.repository";

export const readParam = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Parse the `/spend` URL `status` param into the `MeteringStatusFilter` union.
 * Missing or unknown values default to `'ok'` so the dashboard preserves its
 * historical behavior when the param is absent.
 */
export const readMeteringStatus = (v: unknown): MeteringStatusFilter => {
    if (v === "blocked" || v === "both") return v;
    return "ok";
};

/**
 * Parse a comma-separated multi-value URL param into a string list. Empty
 * tokens are stripped. Returns `[]` for missing or empty input.
 */
export const readParamList = (v: unknown): string[] => {
    if (typeof v !== "string" || v.length === 0) return [];
    return v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
};

/**
 * Build a `MeteringFilters` from the conventional dashboard search-param
 * shape (provider / tenant_id / agent_id / workflow_id / model). Empty
 * dimensions stay as `[]` — repositories treat that as "no filter".
 */
export interface MeteringFilterSearch {
    provider?: string;
    tenant_id?: string;
    agent_id?: string;
    workflow_id?: string;
    model?: string;
}

export const readMeteringFilters = (search: MeteringFilterSearch): MeteringFilters => ({
    provider: readParamList(search.provider),
    tenantId: readParamList(search.tenant_id),
    agentId: readParamList(search.agent_id),
    workflowId: readParamList(search.workflow_id),
    model: readParamList(search.model),
});
