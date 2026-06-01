"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProviderSnippet } from "@/lib/onboarding/snippets";
import { ProviderIcon } from "@/lib/providers";

interface ProviderTabListProps {
    readonly snippets: ReadonlyArray<ProviderSnippet>;
}

/** Single-row provider picker: horizontal scroll with edge chevrons that appear only when there's more to reach. */
export function ProviderTabList({ snippets }: ProviderTabListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState({ left: false, right: false });

    const sync = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        setOverflow({
            left: el.scrollLeft > 1,
            right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
        });
    }, []);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        return () => observer.disconnect();
    }, [sync]);

    const scroll = (direction: 1 | -1) => {
        listRef.current?.scrollBy({ left: direction * 160, behavior: "smooth" });
    };

    return (
        <div className="relative">
            <TabsList
                ref={listRef}
                onScroll={sync}
                className="w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] group-data-[orientation=horizontal]/tabs:h-auto [&::-webkit-scrollbar]:hidden"
            >
                {snippets.map((s, i) => (
                    <TabsTrigger key={s.id} value={s.id} autoFocus={i === 0} className="flex-none">
                        <ProviderIcon id={s.id} className="size-4" />
                        {s.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            {overflow.left && (
                <button
                    type="button"
                    aria-label="Scroll providers left"
                    onClick={() => scroll(-1)}
                    className="absolute inset-y-0 left-0 flex items-center rounded-l-lg bg-muted pr-4 pl-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                </button>
            )}
            {overflow.right && (
                <button
                    type="button"
                    aria-label="Scroll providers right"
                    onClick={() => scroll(1)}
                    className="absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-muted pr-1 pl-4 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronRight className="size-4" />
                </button>
            )}
        </div>
    );
}
