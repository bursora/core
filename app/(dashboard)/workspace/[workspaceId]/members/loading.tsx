// Streaming fallback for the Members route. Page header, summary tiles, then
// placeholder member rows in the standard shell.

import { PageHeaderSkeleton } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <section>
            <PageHeaderSkeleton titleClassName="h-7 w-28" subtitleClassName="mt-2 h-4 w-72" />

            <div className="mt-6 space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <Skeleton className="h-4 w-80" />
                    <Skeleton className="h-9 w-32" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-[8px] border border-border bg-background p-3.5"
                        >
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="mt-2 h-7 w-10" />
                        </div>
                    ))}
                </div>

                <ul className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li
                            key={i}
                            className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background p-3"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <Skeleton className="size-9 shrink-0 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-20" />
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
