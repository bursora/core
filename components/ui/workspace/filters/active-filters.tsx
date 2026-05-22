"use client";

import { readParamList } from "@/lib/search-params";
import { X, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "../../button";
import { FacetedFilter, type FacetedFilterOption } from "../../filters/faceted-filter";
import { useUrlParamCommit } from "../../hooks/use-url-param-commit";
import { computeAddableDimensions, computeVisibleDimensions } from "./active-filters-logic";
import { AddFilterButton } from "./add-filter-button";

export interface DimensionConfig {
    readonly paramKey: string;
    readonly label: string;
    readonly icon: LucideIcon;
    readonly options: readonly FacetedFilterOption[];
    readonly single?: boolean;
    readonly clearOnChange?: readonly string[];
}

interface ActiveFiltersProps {
    readonly dimensions: readonly DimensionConfig[];
    /** Extra URL keys to drop when "Clear filters" is clicked (e.g. pagination cursor). */
    readonly clearAlsoDeletes?: readonly string[];
}

export function ActiveFilters({ dimensions, clearAlsoDeletes }: ActiveFiltersProps) {
    const searchParams = useSearchParams();
    const { commit, isPending } = useUrlParamCommit();
    const [justAdded, setJustAdded] = useState<string | null>(null);
    // See `active-filters.tsx` history for the flicker this guards against.
    const committedRef = useRef(false);

    const isActive = (paramKey: string): boolean =>
        readParamList(searchParams.get(paramKey)).length > 0;

    const allKeys = dimensions.map((d) => d.paramKey);
    const visible = computeVisibleDimensions(allKeys, isActive, justAdded);
    const addable = computeAddableDimensions(allKeys, visible);
    const dimByKey = new Map<string, DimensionConfig>(dimensions.map((d) => [d.paramKey, d]));

    const anyActive = allKeys.some(isActive);
    const clearAll = (): void => {
        setJustAdded(null);
        commit({ delete: [...allKeys, ...(clearAlsoDeletes ?? [])] });
    };

    return (
        <div
            role="group"
            aria-label="Filters"
            aria-busy={isPending}
            className="flex flex-wrap items-center gap-2"
        >
            {visible.map((key) => {
                const dim = dimByKey.get(key);
                if (dim === undefined) return null;
                const isPromoted = key === justAdded;
                const promotedProps = isPromoted
                    ? {
                          defaultOpen: true,
                          onCommit: () => {
                              committedRef.current = true;
                          },
                      }
                    : {};
                return (
                    <FacetedFilter
                        key={key}
                        paramKey={dim.paramKey}
                        label={dim.label}
                        icon={dim.icon}
                        options={dim.options}
                        selected={readParamList(searchParams.get(key))}
                        {...(dim.single === true ? { single: true } : {})}
                        {...(dim.clearOnChange !== undefined
                            ? { clearOnChange: dim.clearOnChange }
                            : {})}
                        {...promotedProps}
                        onOpenChange={(open) => {
                            if (!open && isPromoted && !committedRef.current) {
                                setJustAdded(null);
                            }
                            if (!open) committedRef.current = false;
                        }}
                    />
                );
            })}
            <AddFilterButton
                options={addable.flatMap((key) => {
                    const dim = dimByKey.get(key);
                    return dim === undefined ? [] : [{ key, label: dim.label, icon: dim.icon }];
                })}
                onSelect={(key) => setJustAdded(key)}
            />
            {anyActive ? (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 px-2">
                    <X className="size-3.5" aria-hidden />
                    Clear filters
                </Button>
            ) : null}
        </div>
    );
}
