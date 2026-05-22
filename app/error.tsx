"use client";

import { ErrorCard } from "@/components/shell/error-card";

interface ErrorBoundaryProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorBoundaryProps) {
    return (
        <ErrorCard
            error={error}
            reset={reset}
            title="Something went wrong"
            description="An unexpected error occurred. Try again, or head back to the dashboard."
            wrapperClassName="flex min-h-screen items-center justify-center bg-background px-4 py-12"
        />
    );
}
