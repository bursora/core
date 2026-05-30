// View-paywall for a locked Bursora Cloud workspace. Rendered in place of the
// real dashboard when the subscription lapses. The blurred skeleton shapes
// imply there is data behind the gate without leaking any — the server
// short-circuits before fetching, so nothing real reaches this component.
//
// Reused across surfaces; takes only the workspace id so it can build the
// Settings → Billing CTA target.

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildWorkspacePath } from "@/lib/routes";
import Link from "next/link";

interface CloudPaywallProps {
    readonly workspaceId: string;
}

export function CloudPaywall({ workspaceId }: CloudPaywallProps) {
    return (
        <section className="relative isolate overflow-hidden rounded-[8px] border border-border bg-background p-5">
            <div aria-hidden className="pointer-events-none select-none blur-[6px]">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div
                            key={i}
                            className="rounded-[8px] border border-border bg-background p-3.5"
                        >
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-2 h-7 w-32" />
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center bg-background/60 dark:bg-background/70">
                <div className="mx-4 max-w-sm rounded-[8px] border border-border bg-background p-6 text-center shadow-sm dark:bg-muted/30">
                    <h2 className="text-base font-semibold tracking-[-0.01em]">
                        Subscribe to Bursora Cloud
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Your dashboard is paused. Subscribe to see live spend, budgets, and alerts
                        again.
                    </p>
                    <p className="mt-3 font-mono text-sm tabular-nums">
                        <span className="font-semibold">$29/mo</span>
                        <span className="text-muted-foreground">, cancel anytime.</span>
                    </p>
                    <Button asChild className="mt-4">
                        <Link href={buildWorkspacePath(workspaceId, "settings")}>
                            Subscribe to Bursora Cloud
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}
