/**
 * Settings tab descriptors. Server-safe (no React, no client hooks) so
 * `page.tsx` can resolve the active tab during server rendering without
 * pulling the client-only TabsClient module across the RSC boundary.
 */

export const SETTINGS_TABS = ["general", "usage", "pricing", "channels", "activity"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
    general: "General",
    usage: "Usage",
    pricing: "Pricing overrides",
    channels: "Alert channels",
    activity: "Activity log",
};

export function resolveSettingsTab(
    value: string | null | undefined,
    available: readonly SettingsTab[] = SETTINGS_TABS,
): SettingsTab {
    return available.find((t) => t === value) ?? available[0] ?? SETTINGS_TABS[0];
}
