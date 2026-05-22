// Pure presentational sibling of `TopSpendersSnapshot`. Server-renderable.

import type { TopSpender } from "@/lib/metering/top-spender";
import type { Facet } from "@/lib/spend-types";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "../button";
import { DashboardSection } from "../workspace/dashboard-section";
import { FacetTabs } from "../workspace/filters/facet-tabs";
import { TopSpendersTable } from "./top-spenders-table";

export type TopSpendersSnapshotGroupBy =
    | {
          readonly mode: "link";
          readonly basePath: string;
          readonly otherParams: Readonly<Record<string, string | undefined>>;
      }
    | { readonly mode: "local"; readonly onChange: (next: Facet) => void };

export interface TopSpendersSnapshotViewProps {
    readonly facet: Facet;
    readonly suffix: string;
    readonly rows: readonly TopSpender[];
    readonly totalUsd: string;
    readonly modelProviders: Readonly<Record<string, string>>;
    readonly viewAllHref: Route | null;
    readonly groupBy: TopSpendersSnapshotGroupBy;
    readonly workspaceId: string;
    readonly from: Date;
    readonly to: Date;
}

export function TopSpendersSnapshotView({
    facet,
    suffix,
    rows,
    totalUsd,
    modelProviders,
    viewAllHref,
    groupBy,
    workspaceId,
    from,
    to,
}: TopSpendersSnapshotViewProps) {
    return (
        <DashboardSection
            label="Top spenders"
            sublabel={`this ${suffix}`}
            actions={<FacetTabs facet={facet} mode={tabsMode(groupBy)} />}
            bodyClassName="-mx-5"
        >
            {rows.length === 0 ? (
                <div className="px-5">
                    <p className="text-sm text-foreground">{`No spend recorded this ${suffix} yet.`}</p>
                    {viewAllHref !== null ? (
                        <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
                            <Link href={viewAllHref}>Open spend →</Link>
                        </Button>
                    ) : null}
                </div>
            ) : (
                <>
                    <TopSpendersTable
                        rows={rows}
                        totalUsd={totalUsd}
                        workspaceId={workspaceId}
                        facet={facet}
                        from={from}
                        to={to}
                        modelProviders={modelProviders}
                        linkScope={viewAllHref !== null}
                    />
                    {viewAllHref !== null ? (
                        <div className="mt-3 flex justify-end px-5">
                            <Button asChild variant="link" size="sm" className="h-auto p-0">
                                <Link href={viewAllHref}>View all spend →</Link>
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
        </DashboardSection>
    );
}

function tabsMode(groupBy: TopSpendersSnapshotGroupBy):
    | {
          readonly kind: "link";
          readonly basePath: string;
          readonly otherParams: Readonly<Record<string, string | undefined>>;
      }
    | { readonly kind: "local"; readonly onChange: (next: Facet) => void } {
    if (groupBy.mode === "link") {
        return { kind: "link", basePath: groupBy.basePath, otherParams: groupBy.otherParams };
    }
    return { kind: "local", onChange: groupBy.onChange };
}
