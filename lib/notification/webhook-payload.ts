/**
 * Webhook + email payload renderer.
 *
 * Pure: takes an AlertRaisedEvent + channel kind, returns the body the
 * dispatcher will deliver. Slack reads `text`, Discord reads `content`,
 * email gets `{ subject, text }`.
 *
 * `RenderOptions.deniedSinceTrip` threads a live denial count into the
 * budget body so Slack/Discord/email surfaces show "N calls denied since
 * trip" alongside the spend/cap line. Ignored for anomaly events.
 */

import type {
    AlertRaisedEvent,
    AnomalyAlertRaisedEvent,
    BudgetAlertRaisedEvent,
} from "../event-bus";
import { formatAlertPercent, formatUsd, formatWindowLine } from "../format";
import { formatBudgetAttribution } from "./budget-attribution";

export type WebhookPayload = { readonly text: string } | { readonly content: string };

export interface EmailPayload {
    readonly subject: string;
    readonly text: string;
}

export interface RenderOptions {
    readonly deniedSinceTrip?: number;
}

export function renderWebhookPayload(
    channel: "slack" | "discord",
    event: AlertRaisedEvent,
    options: RenderOptions = {},
): WebhookPayload {
    const body = formatBody(event, options);
    return channel === "slack" ? { text: body } : { content: body };
}

export function renderEmailPayload(
    event: AlertRaisedEvent,
    options: RenderOptions = {},
): EmailPayload {
    return {
        subject: formatSubject(event),
        text: formatBody(event, options),
    };
}

const formatBody = (event: AlertRaisedEvent, options: RenderOptions): string =>
    event.kind === "anomaly" ? formatAnomalyBody(event) : formatBudgetBody(event, options);

const formatSubject = (event: AlertRaisedEvent): string =>
    event.kind === "anomaly"
        ? `[Bursora] Anomaly detected - workspace=${event.workspaceId}`
        : `[Bursora] Budget exceeded - ${event.scopeType}:${event.scopeId ?? "*"}`;

const formatAnomalyBody = (event: AnomalyAlertRaisedEvent): string => {
    const tenant = event.tenantId ?? "workspace";
    const agent = event.agentId ?? "workspace";
    const severity = event.severity.toUpperCase();
    const window = formatWindowLine(event);
    return `[${severity}] anomaly on workspace=${event.workspaceId} tenant=${tenant} agent=${agent}\n${window}\n${event.reason}`;
};

const formatBudgetBody = (event: BudgetAlertRaisedEvent, options: RenderOptions): string => {
    const severity = event.severity.toUpperCase();
    const scopeId = event.scopeId ?? "*";
    const usedStr = formatUsd(event.used);
    const limitStr = formatUsd(event.limit);
    const pct = formatAlertPercent(event.pctOver);
    const period = event.periodFrom.toISOString();
    const attribution = formatBudgetAttribution(event, options.deniedSinceTrip);
    return `[${severity}] ${attribution}\nworkspace=${event.workspaceId} scope=${event.scopeType}:${scopeId}\nspend ${usedStr} / limit ${limitStr} (${pct}% over) - period from ${period}`;
};
