"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import "./globals.css";

interface GlobalErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => {
        console.error("[ErrorBoundary]", error.digest, error);
    }, [error]);

    return (
        <html lang="en">
            <body className="bg-background text-foreground">
                <div className="flex min-h-screen items-center justify-center px-4 py-12">
                    <div className="w-full max-w-md">
                        <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
                        <p className="mb-4 text-sm text-muted-foreground">
                            A critical error prevented the app from rendering. Try reloading.
                        </p>
                        {error.digest ? (
                            <p className="mb-4 font-mono text-xs text-muted-foreground">
                                Error ID: {error.digest}
                            </p>
                        ) : null}
                        <Button type="button" onClick={reset}>
                            Try again
                        </Button>
                    </div>
                </div>
            </body>
        </html>
    );
}
