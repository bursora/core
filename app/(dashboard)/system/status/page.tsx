import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { requireAdminUI } from "@/lib/auth";
import type { CronJobStatus } from "@/lib/cron/scheduler";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { collectSystemHealth } from "@/lib/system-health";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { Bug, CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { RefreshButton } from "./_components/refresh-button";
import { ServiceCard } from "./_components/service-card";
import { STATUS_TONE, StatusBadge } from "./_components/status-badge";
import { TestActionButton } from "./_components/test-action-button";
import { sendTestEmailAction, sendTestSentryEventAction } from "./actions";

// Health is probed live on every render; never serve a cached snapshot.
export const dynamic = "force-dynamic";

function formatMb(bytes: number): string {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function formatUptime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(" ");
}

/** How long the last run took. A job that suddenly jumps from ms to seconds is
 *  the canary for something going wrong. */
function formatDurationMs(ms: number): string {
    if (ms < 1_000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1_000);
    return `${minutes}m ${seconds}s`;
}

interface MetricProps {
    label: string;
    children: ReactNode;
}

function Metric({ label, children }: MetricProps) {
    return (
        <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium tabular-nums">{children}</div>
        </div>
    );
}

interface CronJobBadgeProps {
    job: CronJobStatus;
}

function CronJobBadge({ job }: CronJobBadgeProps) {
    if (job.running) {
        return (
            <Badge variant="secondary" className="gap-1">
                <Loader2 className="size-3 animate-spin" /> Running
            </Badge>
        );
    }
    if (job.lastOk === null) {
        return (
            <Badge variant="secondary" className={STATUS_TONE.muted}>
                Idle
            </Badge>
        );
    }
    if (job.lastOk) {
        return (
            <Badge variant="secondary" className={`gap-1 ${STATUS_TONE.ok}`}>
                <CheckCircle2 className="size-3.5" /> OK
            </Badge>
        );
    }
    return (
        <Badge
            variant="secondary"
            className={`gap-1 ${STATUS_TONE.down}`}
            title={job.lastError ?? undefined}
        >
            <XCircle className="size-3.5" /> Failed
        </Badge>
    );
}

export default async function SystemStatusPage() {
    await requireAdminUI();
    const tz = await getRequestTimeZone();
    const health = await collectSystemHealth();
    const issueCount =
        health.services.filter((service) => service.status === "down").length +
        health.cron.jobs.filter((job) => job.lastOk === false).length;
    const allOperational = issueCount === 0;

    return (
        <AppShell>
            <div className="mx-auto max-w-4xl space-y-6">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">System status</h1>
                        <p className="text-sm text-muted-foreground">
                            Live health of every service behind Bursora. Visible to admins only.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                            Checked {formatDateTime(health.checkedAt, tz)}
                        </span>
                        <RefreshButton />
                    </div>
                </header>

                <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3">
                    <span
                        className={
                            allOperational
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                        }
                    >
                        {allOperational ? (
                            <CheckCircle2 className="size-5" />
                        ) : (
                            <XCircle className="size-5" />
                        )}
                    </span>
                    <span className="text-sm font-medium">
                        {allOperational
                            ? "All systems operational"
                            : `${issueCount} ${issueCount === 1 ? "service" : "services"} reporting an issue`}
                    </span>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                        <div className="space-y-1">
                            <CardTitle className="text-base">Server (SSR)</CardTitle>
                            <CardDescription>
                                Next.js runtime rendering this dashboard.
                            </CardDescription>
                        </div>
                        <StatusBadge status="ok" />
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                        <Metric label="Uptime">{formatUptime(health.runtime.uptimeSeconds)}</Metric>
                        <Metric label="Memory (RSS)">
                            {formatMb(health.runtime.memoryRssBytes)}
                        </Metric>
                        <Metric label="Heap used">
                            {formatMb(health.runtime.memoryHeapUsedBytes)}
                        </Metric>
                        <Metric label="Node">{health.runtime.nodeVersion}</Metric>
                        <Metric label="Environment">{health.runtime.nodeEnv}</Metric>
                        <Metric label="Mode">{health.runtime.mode}</Metric>
                    </CardContent>
                </Card>

                <div className="grid gap-4 sm:grid-cols-2">
                    {health.services.map((service) => (
                        <ServiceCard key={service.key} service={service}>
                            {service.key === "smtp" ? (
                                <TestActionButton
                                    label="Send test email"
                                    icon={<Mail />}
                                    action={sendTestEmailAction}
                                    successFallback="Test email sent"
                                />
                            ) : null}
                            {service.key === "sentry" && service.status !== "disabled" ? (
                                <TestActionButton
                                    label="Send test event"
                                    icon={<Bug />}
                                    action={sendTestSentryEventAction}
                                    successFallback="Test event sent to Sentry"
                                />
                            ) : null}
                        </ServiceCard>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Cron scheduler</CardTitle>
                        <CardDescription>In-process scheduled jobs (croner, UTC).</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {health.cron.started ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job</TableHead>
                                        <TableHead>Schedule</TableHead>
                                        <TableHead>Next run</TableHead>
                                        <TableHead>Last run</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {health.cron.jobs.map((job) => (
                                        <TableRow key={job.name}>
                                            <TableCell className="font-medium">
                                                {job.name}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {job.pattern}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {job.nextRunAt
                                                    ? formatRelativeTime(job.nextRunAt)
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {job.lastRunAt
                                                    ? formatRelativeTime(job.lastRunAt)
                                                    : "Not yet run"}
                                            </TableCell>
                                            <TableCell className="tabular-nums text-muted-foreground">
                                                {job.lastDurationMs !== null
                                                    ? formatDurationMs(job.lastDurationMs)
                                                    : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <CronJobBadge job={job} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Scheduler is not running. Jobs start automatically in production.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppShell>
    );
}
