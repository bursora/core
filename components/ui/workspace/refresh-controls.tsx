/**
 * Hydration: `localStorage` is read via `useSyncExternalStore` with an off
 * server snapshot, so the SSR markup always reflects the off state and the
 * first client render matches before subscribing.
 */

"use client";

import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "../button";

const LIVE_STORAGE_KEY = "bursora.dashboard.live";
const LIVE_ON_VALUE = "1";
const LIVE_CHANGE_EVENT = "bursora:dashboard-live-change";
const AUTO_REFRESH_MS = 60_000;
const RELATIVE_TICK_MS = 10_000;

function subscribeLive(callback: () => void): () => void {
    window.addEventListener(LIVE_CHANGE_EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener(LIVE_CHANGE_EVENT, callback);
        window.removeEventListener("storage", callback);
    };
}

function getLiveSnapshot(): boolean {
    return window.localStorage.getItem(LIVE_STORAGE_KEY) === LIVE_ON_VALUE;
}

function getLiveServerSnapshot(): boolean {
    return false;
}

function writeLive(next: boolean): void {
    if (next) {
        window.localStorage.setItem(LIVE_STORAGE_KEY, LIVE_ON_VALUE);
    } else {
        window.localStorage.removeItem(LIVE_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(LIVE_CHANGE_EVENT));
}

export function RefreshControls() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
    const [now, setNow] = useState<number>(() => Date.now());
    const live = useSyncExternalStore(subscribeLive, getLiveSnapshot, getLiveServerSnapshot);

    const refresh = useCallback((): void => {
        startTransition(() => {
            router.refresh();
            setLastRefreshedAt(new Date());
            setNow(Date.now());
        });
    }, [router]);

    // Tick the relative-time label so "Updated Xs ago" stays current between
    // refreshes.
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    // When Live is on, re-pull every 60s. `lastRefreshedAt` is in deps so the
    // interval resets after every refresh; manual clicks push the next
    // auto-tick a full 60s out instead of letting it fire seconds later.
    useEffect(() => {
        if (!live) return;
        const id = window.setInterval(refresh, AUTO_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [live, refresh, lastRefreshedAt]);

    const toggleLive = (): void => {
        writeLive(!live);
    };

    return (
        <div className="inline-flex items-center gap-2">
            <Button
                type="button"
                variant="outline"
                onClick={refresh}
                disabled={isPending}
                aria-label="Refresh dashboard"
                aria-busy={isPending}
                className="h-7 w-7 [&_svg]:size-3.5"
            >
                <RotateCw className={cn(isPending && "animate-spin")} />
            </Button>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleLive}
                aria-pressed={live}
                className="h-7 gap-1.5 px-2.5 text-xs font-medium"
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        "inline-block size-2 rounded-full border",
                        live
                            ? "border-success bg-success"
                            : "border-muted-foreground/40 bg-transparent",
                    )}
                />
                Live
            </Button>
            <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(lastRefreshedAt, now)}
            </span>
        </div>
    );
}
