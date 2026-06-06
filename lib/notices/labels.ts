import type { DashboardSetupErrorCategory } from "../setup-errors/category";

export interface NoticeLabel {
    readonly title: string;
    readonly body: string;
}

export const COUNT_PLACEHOLDER = "{count}";

// `body` keeps a literal `{count}` token; the banner replaces it with the
// live 24h bucket sum at render time so the copy reflects current state
// (the notification row is written once at the 0→1 crossing and the body
// would otherwise stay frozen). Copy is phrased plural-safe at any n ≥ 1.
export const NOTICE_LABELS: Record<DashboardSetupErrorCategory, NoticeLabel> = {
    auth_revoked: {
        title: "Unrecognized API key",
        body: `Requests rejected as unauthorized in the last 24h: ${COUNT_PLACEHOLDER}. Check your API key.`,
    },
    ingest_invalid_body: {
        title: "Invalid ingest payload",
        body: `Ingest requests that failed validation in the last 24h: ${COUNT_PLACEHOLDER}. Update your SDK.`,
    },
    ingest_failed: {
        title: "Some usage events didn't record",
        body: `Usage events Bursora failed to record in the last 24h: ${COUNT_PLACEHOLDER}. Recent spend may be undercounted; the SDK retries automatically.`,
    },
    sdk_unknown_provider: {
        title: "SDK could not detect provider",
        body: `wrap() calls that could not detect a provider in the last 24h: ${COUNT_PLACEHOLDER}. Confirm the SDK wraps a supported client.`,
    },
};
