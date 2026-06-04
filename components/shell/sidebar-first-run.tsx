/**
 * First-run sidebar body, shown when the signed-in user has no workspace yet.
 * Replaces the empty workspace nav with a short "get started" roadmap whose
 * first step is the single primary CTA into the setup wizard, plus a muted
 * preview of the nav a workspace unlocks. Rendered by `AppShell` in place of
 * `SidebarNav`.
 */

import { Button } from "@/components/ui/button";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Plus, Receipt, Target } from "lucide-react";
import Link from "next/link";

const NEXT_STEPS = ["Drop in the SDK", "See your first call land"] as const;

const LOCKED_LINKS = [
    { label: "Dashboard", Icon: LayoutDashboard },
    { label: "Spend", Icon: Receipt },
    { label: "Budgets", Icon: Target },
] as const;

const STEP_BADGE =
    "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums";

export function SidebarFirstRun() {
    return (
        <>
            <SidebarGroup>
                <SidebarGroupLabel>Get started</SidebarGroupLabel>
                <SidebarGroupContent className="space-y-2.5 px-2">
                    <div className="flex items-center gap-2.5">
                        <span
                            className={cn(
                                STEP_BADGE,
                                "border-primary bg-primary text-primary-foreground",
                            )}
                        >
                            1
                        </span>
                        <Button asChild size="sm" className="flex-1 justify-start gap-2">
                            <Link href="/workspace/new">
                                <Plus className="size-4" />
                                Create a workspace
                            </Link>
                        </Button>
                    </div>
                    {NEXT_STEPS.map((step, i) => (
                        <div key={step} className="flex items-center gap-2.5">
                            <span className={cn(STEP_BADGE, "border-border text-muted-foreground")}>
                                {i + 2}
                            </span>
                            <span className="text-xs text-muted-foreground">{step}</span>
                        </div>
                    ))}
                </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
                <SidebarGroupLabel>Unlocks with a workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        {LOCKED_LINKS.map(({ label, Icon }) => (
                            <SidebarMenuItem key={label}>
                                <SidebarMenuButton disabled className="opacity-50">
                                    <Icon />
                                    <span>{label}</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </>
    );
}
