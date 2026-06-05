import {
    Bell,
    Bot,
    Gauge,
    Layers,
    ShieldBan,
    Users,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import type { BudgetMode, ScopeType } from "./budgeting/budget";
import type { Period } from "./budgeting/period";
import type { StatusTagTone } from "./status-tag-tone";

interface ScopeMeta {
    readonly Icon: LucideIcon;
    readonly label: string;
    readonly optionLabel: string;
}

interface ModeMeta {
    readonly Icon: LucideIcon;
    readonly label: string;
    readonly optionLabel: string;
    readonly tone: StatusTagTone;
    readonly description: string;
}

interface PeriodMeta {
    readonly label: string;
    readonly optionLabel: string;
}

export const SCOPE_META: Record<ScopeType, ScopeMeta> = {
    workspace: { Icon: Layers, label: "Workspace", optionLabel: "Entire workspace" },
    tenant: { Icon: Users, label: "Tenant", optionLabel: "Per tenant" },
    agent: { Icon: Bot, label: "Agent", optionLabel: "Per agent" },
    workflow: { Icon: Workflow, label: "Workflow", optionLabel: "Per workflow" },
};

export const MODE_META: Record<BudgetMode, ModeMeta> = {
    notify: {
        Icon: Bell,
        label: "Notify",
        optionLabel: "Notify only",
        tone: "muted",
        description: "Notifies at thresholds; requests continue.",
    },
    throttle: {
        Icon: Gauge,
        label: "Throttle",
        optionLabel: "Throttle requests",
        tone: "warning",
        description: "Slows requests once the limit is hit.",
    },
    block: {
        Icon: ShieldBan,
        label: "Block",
        optionLabel: "Hard block",
        tone: "destructive",
        description: "Rejects requests once the limit is hit.",
    },
};

export const PERIOD_META: Record<Period, PeriodMeta> = {
    daily: { label: "Daily", optionLabel: "Daily reset" },
    weekly: { label: "Weekly", optionLabel: "Weekly reset" },
    monthly: { label: "Monthly", optionLabel: "Monthly reset" },
};
