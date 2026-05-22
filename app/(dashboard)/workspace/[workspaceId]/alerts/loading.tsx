// Streaming fallback for the Alerts route. Mirrors layout chrome so the page
// snaps into place when server data resolves.

import { PageHeaderSkeleton } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <section className="flex flex-col gap-6">
            <PageHeaderSkeleton titleClassName="h-7 w-24" subtitleClassName="mt-2 h-4 w-56" />

            <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-28" />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[8px] border border-border bg-background p-3.5">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="mt-2 h-7 w-12" />
                        <Skeleton className="mt-2 h-3 w-24" />
                    </div>
                ))}
            </div>

            <div className="rounded-[8px] border border-border bg-background p-5">
                <Skeleton className="h-3 w-40" />
                <ul className="-mx-5 mt-4 divide-y divide-border/60">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <Skeleton className="size-8 rounded-full" />
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
