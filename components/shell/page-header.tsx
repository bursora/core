/**
 * Standard page header used across dashboard routes. Title + optional
 * subtitle + optional trailing actions slot.
 */

import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

interface PageHeaderProps {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
    );
}

interface PageHeaderSkeletonProps {
    titleClassName: string;
    subtitleClassName: string;
}

export function PageHeaderSkeleton({ titleClassName, subtitleClassName }: PageHeaderSkeletonProps) {
    return (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
                <Skeleton className={titleClassName} />
                <Skeleton className={subtitleClassName} />
            </div>
        </header>
    );
}
