"use client";

import {
    createPricingOverrideAction,
    updatePricingOverrideAction,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { RichSelect, type RichSelectItem } from "@/components/ui/rich-select";
import { normalizeNumericInput } from "@/lib/format";
import { PROVIDER_IDS, providerLabel, type ProviderId } from "@/lib/providers";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const decimal = z
    .string()
    .refine(
        (v) => v.length > 0 && Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0,
        { message: "Must be a non-negative number" },
    );

const optionalDecimal = z
    .string()
    .refine(
        (v) =>
            v.length === 0 || (Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0),
        { message: "Must be a non-negative number (or empty)" },
    );

const schema = z
    .object({
        provider: z.string().min(1, "Required"),
        model: z.string().min(1, "Required"),
        region: z.string().min(1, "Required"),
        inputPer1mUsd: decimal,
        outputPer1mUsd: decimal,
        cachePer1mUsd: optionalDecimal,
        effectiveFrom: z.string().min(1, "Required"),
        effectiveTo: z.string(),
    })
    .refine(
        (v) => {
            if (v.effectiveTo.length === 0) return true;
            const from = new Date(v.effectiveFrom).getTime();
            const to = new Date(v.effectiveTo).getTime();
            return Number.isFinite(from) && Number.isFinite(to) && to > from;
        },
        { message: "Effective to must be after effective from", path: ["effectiveTo"] },
    );

type FormValues = z.infer<typeof schema>;

interface PricingOverrideFormProps {
    workspaceId: string;
    onSaved?: () => void;
    overrideId?: string;
    initialValues?: Partial<FormValues>;
}

type RegionValue = "global" | "us" | "eu" | "asia";

const PROVIDER_ITEMS: readonly RichSelectItem<ProviderId>[] = PROVIDER_IDS.map((value) => ({
    value,
    label: providerLabel(value),
}));

const REGION_ITEMS: readonly RichSelectItem<RegionValue>[] = [
    { value: "global", label: "Global" },
    { value: "us", label: "US" },
    { value: "eu", label: "EU" },
    { value: "asia", label: "Asia" },
];

function nowLocalIso(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function PricingOverrideForm({
    workspaceId,
    onSaved,
    overrideId,
    initialValues,
}: PricingOverrideFormProps) {
    const isEdit = overrideId !== undefined;
    const [isPending, startTransition] = useTransition();
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            provider: initialValues?.provider ?? "openai",
            model: initialValues?.model ?? "",
            region: initialValues?.region ?? "global",
            inputPer1mUsd: initialValues?.inputPer1mUsd
                ? normalizeNumericInput(initialValues.inputPer1mUsd)
                : "",
            outputPer1mUsd: initialValues?.outputPer1mUsd
                ? normalizeNumericInput(initialValues.outputPer1mUsd)
                : "",
            cachePer1mUsd: initialValues?.cachePer1mUsd
                ? normalizeNumericInput(initialValues.cachePer1mUsd)
                : "",
            effectiveFrom: initialValues?.effectiveFrom ?? nowLocalIso(),
            effectiveTo: initialValues?.effectiveTo ?? "",
        },
    });

    const onSubmit = (values: FormValues) => {
        const fd = new FormData();
        fd.set("workspaceId", workspaceId);
        if (isEdit) fd.set("overrideId", overrideId);
        fd.set("provider", values.provider);
        fd.set("model", values.model);
        fd.set("region", values.region);
        fd.set("inputPer1mUsd", values.inputPer1mUsd);
        fd.set("outputPer1mUsd", values.outputPer1mUsd);
        if (values.cachePer1mUsd.length > 0) {
            fd.set("cachePer1mUsd", values.cachePer1mUsd);
        }
        fd.set("effectiveFrom", values.effectiveFrom);
        if (values.effectiveTo.length > 0) {
            fd.set("effectiveTo", values.effectiveTo);
        }

        startTransition(async () => {
            const result = await (isEdit
                ? updatePricingOverrideAction(fd)
                : createPricingOverrideAction(fd));
            if (!result.ok) {
                if (result.fieldErrors) {
                    for (const [field, message] of Object.entries(result.fieldErrors)) {
                        form.setError(field as keyof FormValues, {
                            type: "server",
                            message,
                        });
                    }
                }
                toast.error(result.error ?? "Could not save override");
                return;
            }
            toast.success(isEdit ? "Override updated" : "Override saved");
            if (!isEdit) form.reset();
            onSaved?.();
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
                <Section title="Target" hint="What this rule matches.">
                    <div className="grid gap-3 sm:grid-cols-6">
                        <FormField
                            control={form.control}
                            name="provider"
                            render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                    <FormLabel>Provider</FormLabel>
                                    <FormControl>
                                        <RichSelect<ProviderId>
                                            value={field.value as ProviderId}
                                            onValueChange={field.onChange}
                                            items={PROVIDER_ITEMS}
                                            placeholder="Select provider"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="model"
                            render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                    <FormLabel>Model</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="gpt-4o"
                                            autoComplete="off"
                                            spellCheck={false}
                                            className="font-mono text-sm"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="region"
                            render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                    <FormLabel>Region</FormLabel>
                                    <FormControl>
                                        <RichSelect<RegionValue>
                                            value={field.value as RegionValue}
                                            onValueChange={field.onChange}
                                            items={REGION_ITEMS}
                                            placeholder="Region"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </Section>

                <Section
                    title="Rate"
                    hint="USD per 1M tokens. Leave cached input blank if the model has no cache tier."
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <FormField
                            control={form.control}
                            name="inputPer1mUsd"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Input</FormLabel>
                                    <FormControl>
                                        <MoneyInput
                                            placeholder="2.50"
                                            value={field.value}
                                            onChange={field.onChange}
                                            onBlur={field.onBlur}
                                            name={field.name}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="outputPer1mUsd"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Output</FormLabel>
                                    <FormControl>
                                        <MoneyInput
                                            placeholder="10.00"
                                            value={field.value}
                                            onChange={field.onChange}
                                            onBlur={field.onBlur}
                                            name={field.name}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="cachePer1mUsd"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-1.5">
                                        <span>Cached input</span>
                                        <OptionalTag />
                                    </FormLabel>
                                    <FormControl>
                                        <MoneyInput
                                            placeholder="0.50"
                                            value={field.value}
                                            onChange={field.onChange}
                                            onBlur={field.onBlur}
                                            name={field.name}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </Section>

                <Section
                    title="Effective window"
                    hint="When this rate applies. Times are local to your browser."
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="effectiveFrom"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-2">
                                        <span>From</span>
                                        <Button
                                            type="button"
                                            variant="link"
                                            size="sm"
                                            onClick={() => field.onChange(nowLocalIso())}
                                            className="h-auto p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
                                        >
                                            now
                                        </Button>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="datetime-local"
                                            className="tabular-nums"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="effectiveTo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-1.5">
                                        <span>To</span>
                                        <OptionalTag label="indefinite" />
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="datetime-local"
                                            className="tabular-nums"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </Section>

                <DialogFooter className="mt-2 border-t pt-4">
                    <DialogClose asChild>
                        <Button type="button" variant="ghost" disabled={isPending}>
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? "Saving…" : isEdit ? "Save changes" : "Save override"}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

function Section({
    title,
    hint,
    children,
}: {
    title: string;
    hint: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <header className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-medium text-foreground">{title}</h4>
                <p className="truncate text-xs text-muted-foreground">{hint}</p>
            </header>
            {children}
        </section>
    );
}

function OptionalTag({ label = "optional" }: { label?: string }) {
    return <span className="text-xs font-normal text-muted-foreground">{label}</span>;
}
