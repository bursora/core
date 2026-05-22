/**
 * Public API of the detection feature.
 *
 * Consumers in `app/` and other features import everything they need from
 * here: the `alerts` table, the pure `detectAnomaly` deep module, the cron
 * entry that pulls scoped spend series and persists alerts in batch, and the
 * read-side `listAlerts` for the dashboard.
 */

export type { AlertKind, AlertSeverity } from "../severity";
export type { Alert, AlertScope, AnomalyAlert, BudgetAlert } from "./alert";
export type {
    AlertRepository,
    AlertScopeType,
    BudgetCrossingPayload,
    BudgetCrossingRecord,
    InsertedAlert,
    ListAlertsQuery,
    RecordBudgetCrossingResult,
} from "./alert.repository";
export { detectAnomaly, type BaselineWindow, type SpendPoint } from "./detect-anomaly";
export {
    DEFAULT_LIST_ALERTS_LIMIT,
    listAlertsUseCase,
    type ListAlertsInput,
} from "./list-alerts.usecase";
export {
    DEFAULT_BASELINE_POINTS,
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_SPIKE_MULTIPLIER,
    runAnomalyDetection,
    type RunAnomalyDetectionInput,
    type RunAnomalyDetectionSummary,
} from "./run-anomaly-detection.usecase";
export {
    detectionDeps,
    listAlerts,
    runAnomalyCron,
    setAlertsDepsForTesting,
    setDetectionDepsForTesting,
    type AlertsDeps,
    type DetectionDeps,
    type ListAlertsArgs,
} from "./server";
export type { ScopeKey, ScopedSpendSeries, SpendSeriesSource } from "./spend-series-source";

export { drizzleAlertRepository } from "./drizzle-alert.repository";

export { budgetAlertToEvent } from "./alert-row";

export {
    anomalyAlertId,
    buildSpendLink,
    flattenScope,
    scopeLabel,
    type FlatScope,
} from "./alerts-ui";
