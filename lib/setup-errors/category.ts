// 24h window: must match the dashboard rollup query and the banner's
// dismissal freshness check.
export const DASHBOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD_SETUP_ERROR_CATEGORIES = [
    "auth_revoked",
    "ingest_invalid_body",
    "sdk_unknown_provider",
] as const;

export type DashboardSetupErrorCategory = (typeof DASHBOARD_SETUP_ERROR_CATEGORIES)[number];

export const SETUP_ERROR_CATEGORIES = [
    ...DASHBOARD_SETUP_ERROR_CATEGORIES,
    "auth_unknown",
] as const;

export type SetupErrorCategory = (typeof SETUP_ERROR_CATEGORIES)[number];

export function isDashboardCategory(value: string): value is DashboardSetupErrorCategory {
    return (DASHBOARD_SETUP_ERROR_CATEGORIES as readonly string[]).includes(value);
}
