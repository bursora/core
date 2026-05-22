/**
 * Cloud-only settings panel exposing the spike-protection toggle and the
 * threshold multiplier. Server-renders the current setting (falling back
 * to the global default when the workspace has no row) and hands the
 * client form an initial state to start from.
 */

import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { resolveSpikeSettings } from "@/lib/spike-protection/server";
import { SpikeProtectionForm } from "./spike-protection-form";

interface SpikeProtectionSectionProps {
    readonly workspaceId: string;
}

export async function SpikeProtectionSection({ workspaceId }: SpikeProtectionSectionProps) {
    const resolved = await resolveSpikeSettings(workspaceId);
    return (
        <DashboardSection label="Spike protection" sublabel="7-day baseline · 30-min cooldown">
            <SpikeProtectionForm
                workspaceId={workspaceId}
                initialEnabled={resolved.enabled}
                initialMultiplier={resolved.thresholdMultiplier}
            />
        </DashboardSection>
    );
}
