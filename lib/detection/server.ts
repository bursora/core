/**
 * Detection wiring (server-only).
 *
 * Wires concrete adapters for the cron entry (`runAnomalyCron`) and the
 * read-side feed (`listAlerts`). Consumers in `app/` import the bound
 * functions via `./detection`; tests override the wiring via
 * `setDetectionDepsForTesting` / `setAlertsDepsForTesting`.
 */

import { db } from "@/lib/db";
import type { Alert, AnomalyAlert, BudgetAlert } from "./alert";
import type { AlertRepository } from "./alert.repository";
import { drizzleAlertRepository } from "./drizzle-alert.repository";
import { drizzleSpendSeriesSource } from "./drizzle-spend-series.source";
import { listAlertsUseCase, type ListAlertsInput } from "./list-alerts.usecase";
import {
    runAnomalyDetection,
    type RunAnomalyDetectionSummary,
} from "./run-anomaly-detection.usecase";
import type { SpendSeriesSource } from "./spend-series-source";
import type { EventBus } from "../event-bus";
import { eventBus } from "../in-memory-event-bus";
import { ensureNotificationBootstrap } from "../notification/bootstrap";
import "server-only";

export interface DetectionDeps {
    readonly source: SpendSeriesSource;
    readonly alerts: AlertRepository;
    readonly bus: EventBus;
}

export interface AlertsDeps {
    readonly alerts: AlertRepository;
}

let detectionOverride: DetectionDeps | null = null;
let alertsOverride: AlertsDeps | null = null;

export function setDetectionDepsForTesting(deps: DetectionDeps | null): void {
    detectionOverride = deps;
}

export function setAlertsDepsForTesting(deps: AlertsDeps | null): void {
    alertsOverride = deps;
}

export function detectionDeps(): DetectionDeps {
    if (detectionOverride !== null) return detectionOverride;
    ensureNotificationBootstrap();
    return {
        source: drizzleSpendSeriesSource(db()),
        alerts: drizzleAlertRepository(db()),
        bus: eventBus(),
    };
}

function alertsDeps(): AlertsDeps {
    if (alertsOverride !== null) return alertsOverride;
    return { alerts: drizzleAlertRepository(db()) };
}

export async function runAnomalyCron(now: Date = new Date()): Promise<RunAnomalyDetectionSummary> {
    const deps = detectionDeps();
    return runAnomalyDetection({
        now,
        source: deps.source,
        alerts: deps.alerts,
        bus: deps.bus,
    });
}

export type ListAlertsArgs = Omit<ListAlertsInput, "alerts">;

export function listAlerts(
    input: ListAlertsArgs & { readonly kind: "anomaly" },
): Promise<readonly AnomalyAlert[]>;
export function listAlerts(
    input: ListAlertsArgs & { readonly kind: "budget" },
): Promise<readonly BudgetAlert[]>;
export function listAlerts(input: ListAlertsArgs): Promise<readonly Alert[]>;
export async function listAlerts(input: ListAlertsArgs): Promise<readonly Alert[]> {
    const deps = alertsDeps();
    return listAlertsUseCase({ ...input, alerts: deps.alerts });
}
