import { cn } from "@/lib/utils";

interface LogoProps {
    readonly className?: string;
}

export function Logo({ className }: LogoProps) {
    return (
        <span
            aria-hidden="true"
            className={cn("inline-flex shrink-0 items-center justify-center", className)}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image
                adds nothing for local SVGs and forces `fill` + explicit dimensions
                that conflict with the fluid `size-*` classes callers pass via className. */}
            <img src="/bursora-dark.svg" alt="" className="block size-full dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
            <img src="/bursora-light.svg" alt="" className="hidden size-full dark:block" />
        </span>
    );
}
