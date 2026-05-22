"use client";

/**
 * Kind + severity chip filters for the Settings → Activity tab. Thin client
 * wrapper around the generic `ActiveFilters` — keeps Lucide icon references
 * (which are functions and don't cross the RSC boundary) inside a client
 * module so the server-rendered `ActivityTab` can mount it without serialising
 * a function prop.
 */

import { ActiveFilters } from "@/components/ui/workspace/filters/active-filters";
import {
    ACTIVITY_KIND_LABELS,
    ACTIVITY_KIND_VALUES,
    ACTIVITY_SEVERITY_VALUES,
    type ActivitySeverity,
} from "@/lib/metering";
import { Layers, ShieldAlert } from "lucide-react";

const SEVERITY_LABELS: Record<ActivitySeverity, string> = {
    info: "Info",
    warning: "Warning",
    critical: "Critical",
};

const KIND_OPTIONS = ACTIVITY_KIND_VALUES.map((v) => ({
    value: v,
    label: ACTIVITY_KIND_LABELS[v],
    count: 0,
}));

const SEVERITY_OPTIONS = ACTIVITY_SEVERITY_VALUES.map((v) => ({
    value: v,
    label: SEVERITY_LABELS[v],
    count: 0,
}));

export function ActivityActiveFilters() {
    return (
        <ActiveFilters
            dimensions={[
                {
                    paramKey: "kind",
                    label: "Kind",
                    icon: Layers,
                    options: KIND_OPTIONS,
                    single: true,
                    clearOnChange: ["cursor"],
                },
                {
                    paramKey: "severity",
                    label: "Severity",
                    icon: ShieldAlert,
                    options: SEVERITY_OPTIONS,
                    single: true,
                    clearOnChange: ["cursor"],
                },
            ]}
            clearAlsoDeletes={["cursor"]}
        />
    );
}
