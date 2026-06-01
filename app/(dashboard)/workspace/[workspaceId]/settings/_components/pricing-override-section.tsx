import { listEffectivePricingForWorkspace } from "@/lib/compose/settings";
import { PricingOverridesPanel } from "./pricing-overrides-panel";
import { buildPricingPage, parsePricingSearch, type PricingRowView } from "./pricing-panel-helpers";

interface PricingOverrideSectionProps {
    workspaceId: string;
    searchParams: Record<string, string | undefined>;
}

export async function PricingOverrideSection({
    workspaceId,
    searchParams,
}: PricingOverrideSectionProps) {
    const effective = await listEffectivePricingForWorkspace(workspaceId);

    const rows: PricingRowView[] = effective.map((e) => {
        const base = {
            provider: e.provider,
            model: e.model,
            region: e.region,
            inputPer1mUsd: e.inputPer1mUsd,
            outputPer1mUsd: e.outputPer1mUsd,
            cachePer1mUsd: e.cachePer1mUsd,
            effectiveFrom: e.effectiveFrom.toISOString(),
            effectiveTo: e.effectiveTo === null ? null : e.effectiveTo.toISOString(),
        };
        return e.source === "override"
            ? { ...base, source: "override", overrideId: e.overrideId }
            : { ...base, source: "global", overrideId: null };
    });

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined) params.set(k, v);
    }
    const page = buildPricingPage(rows, parsePricingSearch(params), new Date().getTime());

    return (
        <PricingOverridesPanel
            workspaceId={workspaceId}
            rows={page.rows}
            counts={page.counts}
            providers={page.providers}
            total={page.total}
            page={page.page}
            pageCount={page.pageCount}
        />
    );
}
