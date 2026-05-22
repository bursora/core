"use client";

/**
 * Single dismissible banner row, rendered by `WorkspaceBannerNotifications`
 * from a notification row. The X button marks the notification read via the
 * internal endpoint; the next server render no longer includes the row, so
 * dismissal is persistent across sessions and devices.
 */

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

type BannerVariant = "destructive" | "warning";

interface DismissibleBannerProps {
    readonly notificationId: string;
    readonly href: Route;
    readonly message: string;
    readonly variant: BannerVariant;
    readonly icon: ReactNode;
    readonly dismissAriaLabel: string;
}

const DISMISS_BUTTON_TONE: Record<BannerVariant, string> = {
    destructive: "text-destructive/70 hover:bg-destructive/10 hover:text-destructive",
    warning: "text-warning/70 hover:bg-warning/10 hover:text-warning",
};

export function DismissibleBanner({
    notificationId,
    href,
    message,
    variant,
    icon,
    dismissAriaLabel,
}: DismissibleBannerProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleDismiss = (): void => {
        startTransition(async () => {
            const res = await fetch("/api/internal/user/notifications", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ itemIds: [notificationId] }),
            });
            if (res.ok) router.refresh();
        });
    };

    return (
        <div className="relative">
            <Link href={href} className="block hover:opacity-90">
                <Alert variant={variant} className={cn("pr-12")}>
                    {icon}
                    <AlertTitle>{message}</AlertTitle>
                </Alert>
            </Link>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isPending}
                className={cn("absolute top-2 right-2 size-7", DISMISS_BUTTON_TONE[variant])}
                onClick={handleDismiss}
                aria-label={dismissAriaLabel}
            >
                <XIcon />
            </Button>
        </div>
    );
}
