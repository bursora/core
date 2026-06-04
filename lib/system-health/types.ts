import type { CronStatus } from "@/lib/cron/scheduler";

export type ServiceStatus = "ok" | "down" | "disabled";

/** Health of one backing service, rendered as a card on the status page. */
export interface ServiceHealth {
    readonly key: string;
    readonly label: string;
    readonly status: ServiceStatus;
    /** Probe round-trip in ms, when the check made a live call. */
    readonly latencyMs?: number;
    /** Human summary shown when ok or disabled (never a secret). */
    readonly detail?: string;
    /** Failure message shown when down. */
    readonly error?: string;
}

export interface RuntimeInfo {
    readonly uptimeSeconds: number;
    readonly memoryRssBytes: number;
    readonly memoryHeapUsedBytes: number;
    readonly nodeVersion: string;
    readonly nodeEnv: string;
    readonly mode: string;
}

export interface SystemHealth {
    readonly runtime: RuntimeInfo;
    readonly services: readonly ServiceHealth[];
    readonly cron: CronStatus;
    readonly checkedAt: Date;
}
