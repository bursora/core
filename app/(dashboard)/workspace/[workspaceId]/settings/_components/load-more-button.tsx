"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface LoadMoreButtonProps {
    readonly href: Route;
}

/**
 * Appends the next page by growing the `shown` count in the URL. Navigates
 * with `scroll: false` so the viewport stays put, and shows a spinner while
 * the transition is in flight (matches the refresh control elsewhere).
 */
export function LoadMoreButton({ href }: LoadMoreButtonProps): React.JSX.Element {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <div className="border-t px-5 py-3">
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={isPending}
                aria-busy={isPending}
                onClick={() => startTransition(() => router.push(href, { scroll: false }))}
            >
                {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Load more
            </Button>
        </div>
    );
}
