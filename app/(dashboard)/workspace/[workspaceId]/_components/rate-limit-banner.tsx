/**
 * Top-of-dashboard banner for active rate-limit or spike-protection caps.
 *
 * Renders when any of the following is true for the workspace:
 *   - An active API key is at or above 80% of its 100 req/sec sustained cap.
 *   - An active API key is at or above 80% of its 1000 req/10s burst cap.
 *   - Spike protection is currently in cooldown.
 *
 * The component shows the live rate, the 7-day baseline, and the cooldown
 * remainder so operators can confirm what's firing without leaving the
 * dashboard. Reading the limiter is free when both protections are off
 * (the deps short-circuit before any Redis call), so this is safe to render
 * unconditionally.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCount } from "@/lib/format";
import { readWorkspaceCapStatus, type ApiKeyCapStatus } from "@/lib/rate-limit/server";
import { readSpikeDashboardStatus, type SpikeDashboardStatus } from "@/lib/spike-protection/server";
import { Gauge } from "lucide-react";

const SATURATION_THRESHOLD = 0.8;

interface RateLimitBannerProps {
    readonly workspaceId: string;
}

export async function RateLimitBanner({ workspaceId }: RateLimitBannerProps) {
    const [keys, spike] = await Promise.all([
        readWorkspaceCapStatus(workspaceId),
        readSpikeDashboardStatus(workspaceId),
    ]);

    const saturatedKeys = keys.filter(isSaturated);
    const inCooldown = spike.enabled && spike.cooldownRemainingMs > 0;

    if (saturatedKeys.length === 0 && !inCooldown) return null;

    return (
        <Alert variant="warning">
            <Gauge />
            <AlertTitle>{title(saturatedKeys, inCooldown)}</AlertTitle>
            <AlertDescription>
                {renderKeyLines(saturatedKeys)}
                {inCooldown ? <p>{renderSpikeLine(spike)}</p> : null}
                {spike.enabled && !inCooldown && spike.baselineEventsPerMin > 0 ? (
                    <p>
                        Baseline {formatCount(Math.round(spike.baselineEventsPerMin))} events/min ·
                        threshold {formatCount(Math.round(spike.thresholdEventsPerMin))} (
                        {spike.thresholdMultiplier.toFixed(1)}x).
                    </p>
                ) : null}
            </AlertDescription>
        </Alert>
    );
}

function isSaturated(status: ApiKeyCapStatus): boolean {
    const sustainedRatio = status.sustainedCount / status.sustainedLimit;
    const burstRatio = status.burstCount / status.burstLimit;
    return sustainedRatio >= SATURATION_THRESHOLD || burstRatio >= SATURATION_THRESHOLD;
}

function title(saturatedKeys: readonly ApiKeyCapStatus[], inCooldown: boolean): string {
    if (saturatedKeys.length > 0 && inCooldown) {
        return "Rate-limit and spike-protection caps active";
    }
    if (saturatedKeys.length > 0) {
        return saturatedKeys.length === 1
            ? "API key brushing the rate-limit cap"
            : `${saturatedKeys.length} API keys brushing the rate-limit cap`;
    }
    return "Spike protection cooling down";
}

function renderKeyLines(saturatedKeys: readonly ApiKeyCapStatus[]) {
    if (saturatedKeys.length === 0) return null;
    return (
        <ul className="m-0 list-none space-y-0.5">
            {saturatedKeys.map((k) => (
                <li key={k.apiKeyId}>{renderKeyLine(k)}</li>
            ))}
        </ul>
    );
}

function renderKeyLine(status: ApiKeyCapStatus): string {
    const name = status.apiKeyName.length > 0 ? status.apiKeyName : status.apiKeyId.slice(0, 8);
    return `${name}: ${formatCount(status.sustainedCount)}/${formatCount(status.sustainedLimit)} req/s · ${formatCount(status.burstCount)}/${formatCount(status.burstLimit)} burst`;
}

function renderSpikeLine(spike: SpikeDashboardStatus): string {
    const minutes = Math.ceil(spike.cooldownRemainingMs / 60_000);
    return `Cooldown ${minutes} min remaining · current ${formatCount(spike.currentEventsPerMin)} events/min vs threshold ${formatCount(Math.round(spike.thresholdEventsPerMin))}.`;
}
