"use client";

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useInflight } from "@/components/ui/hooks/use-inflight";
import { MoneyInput } from "@/components/ui/money-input";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import { RichSelect, type RichSelectItem } from "@/components/ui/rich-select";
import { ScopeCombobox } from "@/components/ui/shell/scope-combobox";
import { SubmitButton } from "@/components/ui/submit-button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { ActionResult } from "@/lib/action-result";
import {
    MODES,
    PERIODS,
    SCOPE_TYPES,
    type BudgetMode,
    type Period,
    type ScopeType,
} from "@/lib/budgeting";
import { normalizeNumericInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { MODE_META, PERIOD_META, SCOPE_META } from "./labels";

const budgetSchema = z
    .object({
        scopeType: z.enum(SCOPE_TYPES),
        scopeId: z.string(),
        period: z.enum(PERIODS),
        amountUsd: z
            .string()
            .min(1, "amountUsd is required")
            .refine((v) => {
                const n = Number.parseFloat(v);
                return Number.isFinite(n) && n >= 0;
            }, "amountUsd must be a non-negative number"),
        mode: z.enum(MODES),
    })
    .superRefine((data, ctx) => {
        const trimmed = data.scopeId.trim();
        if (data.scopeType === "workspace") {
            if (trimmed.length > 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["scopeId"],
                    message: "workspace scope must have empty scopeId",
                });
            }
            return;
        }
        if (trimmed.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["scopeId"],
                message: `${data.scopeType} scope requires a non-empty scopeId`,
            });
        }
    });

export type BudgetFormValues = z.infer<typeof budgetSchema>;

const FORM_FIELDS = new Set<keyof BudgetFormValues>([
    "scopeType",
    "scopeId",
    "period",
    "amountUsd",
    "mode",
]);

const AMOUNT_PRESETS = [50, 100, 500, 1000] as const;

const SCOPE_DESCRIPTIONS: Record<ScopeType, string> = {
    workspace: "All requests across this workspace",
    tenant: "Cap spend for one of your customers",
    agent: "Cap spend on a specific AI agent",
    workflow: "Cap spend on a named workflow or job",
};

const SCOPE_SELECT_ITEMS: readonly RichSelectItem<ScopeType>[] = SCOPE_TYPES.map((s) => ({
    value: s,
    label: SCOPE_META[s].optionLabel,
    description: SCOPE_DESCRIPTIONS[s],
    Icon: SCOPE_META[s].Icon,
}));

export interface ScopeSuggestionsMap {
    readonly tenant: readonly string[];
    readonly agent: readonly string[];
    readonly workflow: readonly string[];
}

interface BudgetFormProps {
    readonly action: (values: BudgetFormValues) => Promise<ActionResult>;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
    readonly initial?: {
        readonly scopeType: ScopeType;
        readonly scopeId: string | null;
        readonly period: Period;
        readonly amountUsd: string;
        readonly mode: BudgetMode;
    };
    readonly submitLabel: string;
    readonly onSubmitted?: () => void;
}

export function BudgetForm({
    action,
    initial,
    submitLabel,
    onSubmitted,
    scopeSuggestions,
}: BudgetFormProps) {
    const form = useForm<BudgetFormValues>({
        resolver: zodResolver(budgetSchema),
        defaultValues: {
            scopeType: initial?.scopeType ?? "workspace",
            scopeId: initial?.scopeId ?? "",
            period: initial?.period ?? "monthly",
            amountUsd: initial ? normalizeNumericInput(initial.amountUsd) : "100",
            mode: initial?.mode ?? "notify",
        },
    });

    const scopeType = useWatch({ control: form.control, name: "scopeType" });
    const isWorkspaceScope = scopeType === "workspace";

    const submit = useInflight(async (values: BudgetFormValues) => {
        const normalized: BudgetFormValues = {
            ...values,
            scopeId: isWorkspaceScope ? "" : values.scopeId.trim(),
        };
        const result = await action(normalized);
        if (!result.ok) {
            toast.error(result.error ?? "Failed to save budget.");
            if (result.fieldErrors) {
                for (const [field, message] of Object.entries(result.fieldErrors)) {
                    if (FORM_FIELDS.has(field as keyof BudgetFormValues)) {
                        form.setError(field as keyof BudgetFormValues, {
                            type: "server",
                            message,
                        });
                    }
                }
            }
            return;
        }
        onSubmitted?.();
    });
    const handleSubmit = form.handleSubmit(submit);

    return (
        <Form {...form}>
            <form onSubmit={handleSubmit} className="grid gap-6">
                <FormField
                    control={form.control}
                    name="scopeType"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                            <SectionHeader
                                step="1"
                                title="Apply to"
                                hint="What this budget covers"
                            />
                            <FormControl>
                                <RichSelect<ScopeType>
                                    value={field.value}
                                    onValueChange={(v) => {
                                        field.onChange(v);
                                        if (v === "workspace") form.setValue("scopeId", "");
                                    }}
                                    items={SCOPE_SELECT_ITEMS}
                                    aria-label="Apply to"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {!isWorkspaceScope && (
                    <FormField
                        control={form.control}
                        name="scopeId"
                        render={({ field }) => (
                            <FormItem className="-mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <FormLabel className="text-xs font-medium text-muted-foreground">
                                    {SCOPE_META[scopeType].label} identifier
                                </FormLabel>
                                <FormControl>
                                    <ScopeCombobox
                                        scope={scopeType}
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={() => field.onBlur()}
                                        suggestions={scopeSuggestions?.[scopeType] ?? []}
                                        placeholder={`e.g. ${scopeType}-123`}
                                        name={field.name}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
                    <FormField
                        control={form.control}
                        name="period"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                                <SectionHeader step="2" title="Resets" />
                                <ToggleGroup
                                    type="single"
                                    value={field.value}
                                    onValueChange={(v) => v && field.onChange(v as Period)}
                                    aria-label="Period"
                                >
                                    {PERIODS.map((p) => (
                                        <ToggleGroupItem key={p} value={p}>
                                            {PERIOD_META[p].label}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="size-3" />
                                    Spend counter resets {field.value}
                                </p>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="amountUsd"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                                <SectionHeader step="3" title="Limit" />
                                <FormControl>
                                    <MoneyInput
                                        size="lg"
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={field.onBlur}
                                        name={field.name}
                                        presets={AMOUNT_PRESETS}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                            <SectionHeader
                                step="4"
                                title="When the limit is reached"
                                hint="Pick how strict"
                            />
                            <RadioGroup
                                value={field.value}
                                onValueChange={(v) => field.onChange(v as BudgetMode)}
                                aria-label="Mode"
                                className="grid gap-2 sm:grid-cols-3"
                            >
                                {MODES.map((m) => {
                                    const meta = MODE_META[m];
                                    const selected = field.value === m;
                                    return (
                                        <RadioGroupCard key={m} value={m}>
                                            <div className="flex w-full items-center justify-between gap-2">
                                                <StatusTag
                                                    tone={meta.tone}
                                                    className="flex items-center gap-1"
                                                >
                                                    <meta.Icon className="size-3" />
                                                    {meta.label.toLowerCase()}
                                                </StatusTag>
                                                <span
                                                    className={cn(
                                                        "grid size-4 place-items-center rounded-full border transition-colors",
                                                        selected
                                                            ? "border-primary"
                                                            : "border-input",
                                                    )}
                                                    aria-hidden
                                                >
                                                    {selected && (
                                                        <span className="size-2 rounded-full bg-primary" />
                                                    )}
                                                </span>
                                            </div>
                                            <p className="text-xs leading-snug text-muted-foreground">
                                                {meta.description}
                                            </p>
                                        </RadioGroupCard>
                                    );
                                })}
                            </RadioGroup>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <span className="text-xs text-muted-foreground">
                        Changes apply within 1 minute
                    </span>
                    <SubmitButton pending={form.formState.isSubmitting}>{submitLabel}</SubmitButton>
                </div>
            </form>
        </Form>
    );
}

function SectionHeader({
    step,
    title,
    hint,
}: {
    readonly step: string;
    readonly title: string;
    readonly hint?: string;
}) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-full border bg-muted/60 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {step}
                </span>
                <FormLabel className="text-sm font-semibold">{title}</FormLabel>
            </div>
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
    );
}
