import { listEffectivePricingForWorkspace } from "@/lib/compose/settings";
import { PricingOverridesPanel } from "./pricing-overrides-panel";
import type { PricingRowView } from "./pricing-panel-helpers";

interface PricingOverrideSectionProps {
    workspaceId: string;
}

export async function PricingOverrideSection({ workspaceId }: PricingOverrideSectionProps) {
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

    return <PricingOverridesPanel workspaceId={workspaceId} rows={rows} />;
}
