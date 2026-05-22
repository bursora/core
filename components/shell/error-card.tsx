"use client";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { useEffect } from "react";

interface ErrorCardProps {
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
    readonly title: string;
    readonly description: string;
    readonly wrapperClassName: string;
}

export function ErrorCard({ error, reset, title, description, wrapperClassName }: ErrorCardProps) {
    useEffect(() => {
        console.error("[ErrorBoundary]", error.digest, error);
    }, [error]);

    return (
        <div className={wrapperClassName}>
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                {error.digest ? (
                    <CardContent>
                        <p className="font-mono text-xs text-muted-foreground">
                            Error ID: {error.digest}
                        </p>
                    </CardContent>
                ) : null}
                <CardFooter className="gap-2">
                    <Button onClick={reset}>Try again</Button>
                    <Button asChild variant="outline">
                        <Link href="/">Go to dashboard</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
