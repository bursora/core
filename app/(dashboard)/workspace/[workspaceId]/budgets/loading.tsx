// Streaming fallback for the Budgets route. Page header then summary tile
// row, then placeholder budget cards in the standard shell.

import { PageHeaderSkeleton } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="space-y-6">
            <PageHeaderSkeleton titleClassName="h-7 w-28" subtitleClassName="mt-2 h-4 w-80" />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-9 w-32" />
            </div>

            <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-[8px] border border-border bg-background p-3.5">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="mt-2 h-7 w-10" />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[8px] border border-border bg-background p-4">
                        <div className="flex items-center justify-between gap-3">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="mt-3 h-3 w-40" />
                        <Skeleton className="mt-4 h-7 w-32" />
                        <Skeleton className="mt-3 h-3 w-24" />
                    </div>
                ))}
            </div>
        </div>
    );
}
