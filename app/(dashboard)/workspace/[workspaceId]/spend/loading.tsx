// Streaming fallback for the Spend route. Mirrors the post-resolution layout
// so dashboard chrome appears instantly while server data resolves.

import { PageHeaderSkeleton } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <section className="flex flex-col gap-6">
            <PageHeaderSkeleton titleClassName="h-7 w-24" subtitleClassName="mt-2 h-4 w-48" />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-28" />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <KpiSkeleton key={i} />
                ))}
            </div>

            <SectionSkeleton bodyClassName="h-64" labelWidth="w-32" />
            <SectionSkeleton bodyClassName="h-40" labelWidth="w-40" />
            <SectionSkeleton bodyClassName="h-72" labelWidth="w-36" />
        </section>
    );
}

function KpiSkeleton() {
    return (
        <div className="rounded-[8px] border border-border bg-background p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-24" />
        </div>
    );
}

function SectionSkeleton({
    bodyClassName,
    labelWidth,
}: {
    readonly bodyClassName: string;
    readonly labelWidth: string;
}) {
    return (
        <div className="rounded-[8px] border border-border bg-background p-5">
            <Skeleton className={`h-3 ${labelWidth}`} />
            <Skeleton className={`mt-4 w-full ${bodyClassName}`} />
        </div>
    );
}
