/**
 * Alert email — rendered by `sendAlertEmail` in `lib/notification/send.ts`
 * for any `email` channel subscribed to `alert.raised`. Branches on
 * event kind to surface the right details (anomaly: tenant/agent/reason;
 * budget: scope/spend/limit/period).
 */

import type { AlertRaisedEvent } from "../../event-bus";
import { formatAlertPercent, formatUsd, formatWindowRange } from "../../format";

import { Section, Text } from "@react-email/components";
import type { AlertSeverity } from "../../severity";
import type { RenderOptions } from "../webhook-payload";
import { EmailLayout, Heading, Paragraph } from "./layout";

export interface AlertEmailProps {
    readonly event: AlertRaisedEvent;
    readonly renderOptions?: RenderOptions;
}

export function AlertEmail({ event, renderOptions }: AlertEmailProps) {
    return event.kind === "anomaly" ? (
        <AnomalyAlertEmail event={event} />
    ) : (
        <BudgetAlertEmail event={event} deniedSinceTrip={renderOptions?.deniedSinceTrip ?? 0} />
    );
}

function AnomalyAlertEmail({ event }: { event: Extract<AlertRaisedEvent, { kind: "anomaly" }> }) {
    const severity = event.severity.toUpperCase();
    const window = formatWindowRange(event.windowStart, event.windowEnd);
    return (
        <EmailLayout preview={`Anomaly detected - workspace ${event.workspaceId}`}>
            <SeverityBadge severity={event.severity} />
            <Heading>Anomaly detected</Heading>
            <Paragraph>
                A spend anomaly was detected on workspace <Mono>{event.workspaceId}</Mono>.
            </Paragraph>
            <Field label="Severity" value={severity} />
            <Field label="Tenant" value={event.tenantId ?? "workspace"} />
            <Field label="Agent" value={event.agentId ?? "workspace"} />
            <Field label="Window" value={window} />
            <Field label="Spend in window" value={formatUsd(event.windowCostUsd)} />
            <Paragraph>{event.reason}</Paragraph>
        </EmailLayout>
    );
}

function BudgetAlertEmail({
    event,
    deniedSinceTrip,
}: {
    event: Extract<AlertRaisedEvent, { kind: "budget" }>;
    deniedSinceTrip: number;
}) {
    const severity = event.severity.toUpperCase();
    const scopeId = event.scopeId ?? "*";
    const used = formatUsd(event.used);
    const limit = formatUsd(event.limit);
    const pct = formatAlertPercent(event.pctOver);
    const noun = deniedSinceTrip === 1 ? "call" : "calls";
    return (
        <EmailLayout preview={`Budget exceeded - ${event.scopeType}:${scopeId}`}>
            <SeverityBadge severity={event.severity} />
            <Heading>Budget exceeded</Heading>
            <Paragraph>
                A budget cap was crossed on workspace <Mono>{event.workspaceId}</Mono>.
            </Paragraph>
            <Field label="Severity" value={severity} />
            <Field label="Scope" value={`${event.scopeType}:${scopeId}`} />
            <Field label="Spend" value={`${used} / ${limit}`} />
            <Field label="Over" value={`${pct}%`} />
            <Field label="Period from" value={event.periodFrom.toISOString()} />
            {deniedSinceTrip > 0 ? (
                <Field label="Denied since trip" value={`${deniedSinceTrip} ${noun}`} />
            ) : null}
        </EmailLayout>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <Section className="mt-3">
            <Text className="m-0 text-[12px] uppercase tracking-wide text-[#64748b]">{label}</Text>
            <Text className="m-0 mt-1 text-[14px] text-[#0f172a]">{value}</Text>
        </Section>
    );
}

function Mono({ children }: { children: string }) {
    return (
        <Text className="m-0 inline rounded bg-[#f1f5f9] px-1 font-mono text-[13px] text-[#0f172a]">
            {children}
        </Text>
    );
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
    const styles =
        severity === "critical" ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#fef3c7] text-[#92400e]";
    return (
        <Section>
            <Text
                className={`m-0 inline rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${styles}`}
            >
                {severity}
            </Text>
        </Section>
    );
}
