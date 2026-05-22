import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";
import type { HTMLAttributes } from "react";

export interface NavItemProps extends HTMLAttributes<HTMLElement> {
    readonly active?: boolean;
    readonly asChild?: boolean;
}

function NavItem({ children, active, asChild = false, className, ...props }: NavItemProps) {
    const Comp = asChild ? Slot.Root : "span";
    return (
        <Comp
            className={cn(
                "border-l-2 px-3 py-1.5 text-[13px]",
                active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground",
                className,
            )}
            {...props}
        >
            {children}
        </Comp>
    );
}

export { NavItem };
