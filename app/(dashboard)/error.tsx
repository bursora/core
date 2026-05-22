"use client";

import { ErrorCard } from "@/components/shell/error-card";

interface ErrorBoundaryProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorBoundaryProps) {
    return (
        <ErrorCard
            error={error}
            reset={reset}
            title="This page failed to load"
            description="We hit an error rendering this view. You can retry, or jump back to the dashboard home."
            wrapperClassName="flex flex-1 items-center justify-center px-4 py-12"
        />
    );
}
