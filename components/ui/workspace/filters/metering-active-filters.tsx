"use client";

/**
 * Metering-dimension wrapper for `ActiveFilters`.
 *
 * Spend/alerts/budgets are server components, so they can't construct the
 * dimension config inline — Lucide icon components are functions and don't
 * cross the RSC boundary. This client component receives only serializable
 * props (`optionsByScope`, `modelProviders`, `keys`), resolves icons here,
 * then renders the generic `ActiveFilters`.
 */

import { ActiveFilters } from "./active-filters";
import type { DistinctValuesByScope, ScopeKind } from "@/lib/metering/metering-read.repository";
import { decorateModelOptions } from "@/lib/models";
import { decorateProviderOptions } from "@/lib/providers";
import { Bot, Cpu, Server, Users, Workflow, type LucideIcon } from "lucide-react";

type FilterDimensionKey = "provider" | "tenant_id" | "agent_id" | "workflow_id" | "model";

interface MeteringDimensionMeta {
    readonly paramKey: string;
    readonly scope: ScopeKind;
    readonly label: string;
    readonly icon: LucideIcon;
}

const REGISTRY: Record<FilterDimensionKey, MeteringDimensionMeta> = {
    provider: { paramKey: "provider", scope: "provider", label: "Provider", icon: Server },
    tenant_id: { paramKey: "tenant_id", scope: "tenant", label: "Tenant", icon: Users },
    agent_id: { paramKey: "agent_id", scope: "agent", label: "Agent", icon: Bot },
    workflow_id: { paramKey: "workflow_id", scope: "workflow", label: "Workflow", icon: Workflow },
    model: { paramKey: "model", scope: "model", label: "Model", icon: Cpu },
};

const DEFAULT_KEYS: readonly FilterDimensionKey[] = [
    "provider",
    "tenant_id",
    "agent_id",
    "workflow_id",
    "model",
];

interface MeteringActiveFiltersProps {
    readonly optionsByScope: DistinctValuesByScope;
    /** Slug → provider, resolved server-side from pricing. Drives the model
     *  chip icon. */
    readonly modelProviders?: Readonly<Record<string, string>>;
    readonly keys?: readonly FilterDimensionKey[];
}

export function MeteringActiveFilters({
    optionsByScope,
    modelProviders = {},
    keys = DEFAULT_KEYS,
}: MeteringActiveFiltersProps) {
    const dimensions = keys.map((k) => {
        const meta = REGISTRY[k];
        const raw = optionsByScope[meta.scope] ?? [];
        const options =
            k === "provider"
                ? decorateProviderOptions(raw)
                : k === "model"
                  ? decorateModelOptions(raw, modelProviders)
                  : raw;
        return {
            paramKey: meta.paramKey,
            label: meta.label,
            icon: meta.icon,
            options,
        };
    });
    return <ActiveFilters dimensions={dimensions} />;
}
